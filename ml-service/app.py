"""
Project E-Noise ML classification service (Phase 7).

Loads YAMNet once at startup, exposes POST /classify for the Node backend
to forward WAV clips to. See README.md for setup and the mapping approach.

Security: when ML_API_KEY is set (always set it on Hugging Face, where the
Space is public), /classify only accepts requests with the header
"X-API-Key: <ML_API_KEY>". /health stays open for uptime checks.
"""

import hmac
import io
import logging
import os
from contextlib import asynccontextmanager

import numpy as np
import soundfile as sf
import tensorflow as tf
import tensorflow_hub as hub
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse

from category_mapping import CATEGORIES, build_class_index_to_bucket

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("ml-service")

YAMNET_SAMPLE_RATE = 16000  # YAMNet requires 16kHz mono float32 waveform input
MAX_UPLOAD_BYTES = 2 * 1024 * 1024  # a 1 s 16 kHz clip is ~32 KB; reject anything huge
YAMNET_URL = os.environ.get("YAMNET_URL", "https://tfhub.dev/google/yamnet/1")
API_KEY = os.environ.get("ML_API_KEY", "")

_state = {"model": None, "class_buckets": None}


@asynccontextmanager
async def lifespan(_app):
    load_model()
    yield


app = FastAPI(title="Project E-Noise ML Service", lifespan=lifespan)


def load_model():
    log.info("Loading YAMNet from TensorFlow Hub (first run downloads ~15MB)...")
    model = hub.load(YAMNET_URL)

    class_map_path = model.class_map_path().numpy().decode("utf-8")
    class_names = _load_class_names(class_map_path)
    class_buckets = build_class_index_to_bucket(class_names)

    _state["model"] = model
    _state["class_names"] = class_names
    _state["class_buckets"] = class_buckets
    log.info("YAMNet loaded (%d classes mapped to %d categories).", len(class_names), len(CATEGORIES))
    if not API_KEY:
        log.warning("ML_API_KEY is not set: /classify accepts requests from anyone. Set it when deploying.")


def _load_class_names(class_map_csv_path: str) -> list[str]:
    import csv

    names = []
    with tf.io.gfile.GFile(class_map_csv_path) as f:
        reader = csv.reader(f)
        next(reader)  # header: index,mid,display_name
        for row in reader:
            names.append(row[2])
    return names


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": _state["model"] is not None}


@app.post("/classify")
async def classify(request: Request):
    if API_KEY and not hmac.compare_digest(request.headers.get("x-api-key", ""), API_KEY):
        raise HTTPException(status_code=401, detail="Missing or wrong X-API-Key header.")
    if _state["model"] is None:
        raise HTTPException(status_code=503, detail="Model still loading, try again shortly.")
    if int(request.headers.get("content-length") or 0) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Audio clip is too large.")

    raw_bytes = await request.body()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Empty request body.")
    if len(raw_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Audio clip is too large.")

    try:
        waveform = _decode_wav_to_yamnet_input(raw_bytes)
    except Exception as exc:  # noqa: BLE001 - want to surface any decode failure as a clean 400
        log.warning("Failed to decode incoming audio: %s", exc)
        raise HTTPException(status_code=400, detail="Could not decode audio. Send a WAV file.") from None

    scores, _embeddings, _spectrogram = _state["model"](waveform)
    scores_np = scores.numpy()  # shape: (num_frames, 521)
    mean_scores = scores_np.mean(axis=0)  # average across the clip's frames

    # Per-bucket MAX, not sum: "Ambient Baseline" is a catch-all covering
    # ~500 of YAMNet's 521 classes, so summing would let it win almost
    # every time purely from having far more classes to add up, even when
    # one specific class in a smaller bucket (e.g. "Speech") scored far
    # higher individually. Max keeps the decision tied to the single
    # strongest matching class, not bucket size.
    bucket_top_score = {category: 0.0 for category in CATEGORIES}
    bucket_top_class = {category: None for category in CATEGORIES}

    for class_idx, score in enumerate(mean_scores):
        bucket = _state["class_buckets"][class_idx]
        if float(score) > bucket_top_score[bucket]:
            bucket_top_score[bucket] = float(score)
            bucket_top_class[bucket] = _state["class_names"][class_idx]

    winning_category = max(bucket_top_score, key=bucket_top_score.get)
    confidence = round(bucket_top_score[winning_category], 4)

    return JSONResponse({
        "category": winning_category,
        "confidence": confidence,
        "top_class": bucket_top_class[winning_category]
    })


def _decode_wav_to_yamnet_input(raw_bytes: bytes) -> np.ndarray:
    """
    Decodes a WAV file's bytes into a 1-D float32 waveform in [-1, 1] at
    YAMNet's required 16kHz mono format. The firmware already records at
    16kHz mono, so the common case is a straight decode with no resampling.
    """
    data, sample_rate = sf.read(io.BytesIO(raw_bytes), dtype="float32")

    if data.ndim > 1:
        data = data.mean(axis=1)  # downmix stereo -> mono

    if sample_rate != YAMNET_SAMPLE_RATE:
        data = _resample_linear(data, sample_rate, YAMNET_SAMPLE_RATE)

    return data


def _resample_linear(data: np.ndarray, orig_rate: int, target_rate: int) -> np.ndarray:
    """
    Simple linear-interpolation resampler — adequate for feeding YAMNet
    (which itself works on fairly coarse frames), not audio-quality-grade.
    Only exercised if a clip arrives at something other than 16kHz; the
    firmware always records at 16kHz already, so this is a safety net.
    """
    if len(data) == 0:
        return data
    duration = len(data) / orig_rate
    target_len = int(round(duration * target_rate))
    orig_x = np.linspace(0, duration, num=len(data), endpoint=False)
    target_x = np.linspace(0, duration, num=target_len, endpoint=False)
    return np.interp(target_x, orig_x, data).astype("float32")
