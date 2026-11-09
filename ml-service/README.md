---
title: E-Noise ML Service
emoji: 🔊
colorFrom: green
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---
<!-- The block above is read by Hugging Face Spaces (Docker SDK). Leave it at the very top. -->

# Project E-Noise — ML classification service (Phase 7)

A small FastAPI microservice that classifies a short audio clip into one of
this project's four noise categories using Google's pretrained **YAMNet**
model (521-class AudioSet classifier, loaded from TensorFlow Hub).

The Node backend (`server/`) never runs inference itself — it forwards
each WAV clip it receives from a table's ESP32 node over MQTT to this
service's `/classify` endpoint and stores only the returned label +
confidence. **No audio is ever written to disk here** — a clip is decoded
in memory, classified, and discarded (matches the spec's "no raw audio
storage" rule).

## Status: prototype-stage classifier, not a fine-tuned model

This maps YAMNet's 521 pretrained AudioSet class names to the project's 4
categories with a hand-authored keyword table (`category_mapping.py`) —
there is no labeled Project E-Noise audio behind it yet. Treat its output
as a reasonable starting signal for the live demo, not a validated
accuracy number for your methodology writeup. See "Fine-tuning later" below
for the intended upgrade path once you've collected labeled clips.

## Setup

```bash
cd ml-service
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8001
```

First run downloads YAMNet from TensorFlow Hub (~15 MB) and caches it
locally (`TFHUB_CACHE_DIR`, defaults to a temp dir — set that env var to
pin it somewhere persistent so it isn't re-downloaded every restart).

Point the Node backend at it via `server/.env`:
```
ML_SERVICE_URL=http://localhost:8001
ML_API_KEY=            # optional locally; must match the service's ML_API_KEY
```

### Environment variables

| Name | Default | Purpose |
|---|---|---|
| `ML_API_KEY` | empty | Shared secret. When set, `/classify` needs the header `X-API-Key: <value>`. Always set it on Hugging Face (Spaces are public). |
| `TFHUB_CACHE_DIR` | temp dir | Where YAMNet is cached. |
| `YAMNET_URL` | `https://tfhub.dev/google/yamnet/1` | Model location (rarely changed). |

If startup fails with "contains neither saved_model.pb nor saved_model.pbtxt",
an earlier download was interrupted: delete the folder named in the error
(inside `tfhub_modules`) and start again.

## Deploying on Hugging Face Spaces (free CPU)

1. Create a new Space -> SDK **Docker** -> blank template, hardware **CPU basic (free)**.
2. Push the contents of this `ml-service/` folder (not the whole repo) to the Space's git repo.
   The `Dockerfile` installs the requirements, downloads YAMNet during the build and
   listens on port 7860.
3. In the Space -> Settings -> **Variables and secrets**, add a secret `ML_API_KEY`
   (a long random string). Put the same value in the backend's `ML_API_KEY`.
4. The Space URL is `https://<username>-<space-name>.hf.space`; set that as
   `ML_SERVICE_URL` on the backend. Check `https://<...>.hf.space/health`.

Free Spaces go to sleep when unused and take a while to wake up. The backend
gives up on a request after 15 s and simply keeps working without a label
(incidents then use the fallback category).
If this service isn't running, the backend logs a warning and keeps
working without classification — it's an enhancement, not a hard
dependency of Phases 5/6.

## API

### `POST /classify`
Header: `X-API-Key: <ML_API_KEY>` (only when `ML_API_KEY` is set; otherwise 401).
Body: raw WAV bytes up to 2 MB, `Content-Type: audio/wav` (mono PCM16, any sample
rate — this service resamples to YAMNet's required 16kHz if needed).

Response:
```json
{ "category": "Loud Conversation", "confidence": 0.81, "top_class": "Conversation" }
```
`category` is always one of the four project categories. `top_class` is
YAMNet's own raw top AudioSet label, included for debugging/logging only —
the Node backend ignores it.

### `GET /health`
Returns `{"status": "ok", "model_loaded": true}` once YAMNet has finished
loading (loading happens once at startup, not per-request).

## How the mapping works

`category_mapping.py` buckets YAMNet's 521 class names by keyword
matching (e.g. "speech", "conversation", "chatter" -> Loud Conversation;
"telephone", "ringtone", "cellphone" -> Mobile Phone Noise; "bang", "slam",
"knock", "thud" -> Impact Noise; everything else -> Ambient Baseline).
`app.py` averages YAMNet's per-frame scores across the clip, then chooses
the category whose single strongest matching YAMNet class has the highest
score. It deliberately does not sum scores across a bucket, because Ambient
Baseline is the catch-all bucket and would otherwise win from having many
small class scores.

This is a reasonable zero-shot starting point, not a substitute for a
model actually trained on your study hub's specific sounds — YAMNet was
trained on general AudioSet clips, not tabletop conversations captured
through a MAX9814 electret mic, so expect it to be noticeably rougher on
borderline cases (a muffled thud vs. a dropped book, quiet chatter vs.
ambient HVAC hum) than a fine-tuned model would be.

## Fine-tuning later (once you have labeled clips)

The intended upgrade path, once you've collected and labeled a batch of
real study-hub recordings:

1. For each labeled clip, run it through YAMNet's own embedding layer
   (1024-dim vector per 0.96s frame) instead of its classification head.
2. Train a small dense classifier (a couple of Dense layers, softmax over
   your 4 categories) on those embeddings — this is standard YAMNet
   transfer learning and needs far less data than training a classifier
   from raw audio.
3. Swap `category_mapping.py`'s keyword bucketing for a call into your
   trained classifier head in `app.py`.

`finetune_stub.py` sketches step 1-2 as a starting point — it is
deliberately not wired into `app.py` yet since there's no dataset to train
on. Fill in `load_labeled_clips()` once you have one.
