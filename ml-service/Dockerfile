# Project E-Noise ML service, for Hugging Face Spaces (Docker SDK, free CPU).
# Spaces run the container as user 1000 and send traffic to port 7860.
FROM python:3.11-slim

# libsndfile is what the "soundfile" package uses to read WAV files.
RUN apt-get update && apt-get install -y --no-install-recommends libsndfile1 && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    TFHUB_CACHE_DIR=/home/user/.cache/tfhub \
    TF_CPP_MIN_LOG_LEVEL=2 \
    PYTHONUNBUFFERED=1
WORKDIR /home/user/app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Download YAMNet while building, so the Space starts faster after sleeping.
RUN python -c "import tensorflow_hub as hub; hub.load('https://tfhub.dev/google/yamnet/1')"

COPY --chown=user app.py category_mapping.py ./

EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
