"""
Starting point for fine-tuning a real classifier on top of YAMNet's
embeddings, once you've collected labeled study-hub audio clips.

NOT wired into app.py yet — there's no dataset to train on. This is a
sketch of the standard YAMNet transfer-learning workflow (extract
embeddings, train a small head on top) for when you have one.

Expected data layout (fill in load_labeled_clips() to match however you
actually organize your recordings):
    dataset/
      Loud Conversation/clip1.wav, clip2.wav, ...
      Mobile Phone Noise/clip1.wav, ...
      Impact Noise/clip1.wav, ...
      Ambient Baseline/clip1.wav, ...
"""

import pathlib

import numpy as np
import tensorflow as tf
import tensorflow_hub as hub

from category_mapping import CATEGORIES

YAMNET_SAMPLE_RATE = 16000


def load_labeled_clips(dataset_dir: str) -> tuple[list[np.ndarray], list[str]]:
    """
    TODO (fill in once you have real data): returns (waveforms, labels)
    where each waveform is a 1-D float32 array at 16kHz and each label is
    one of CATEGORIES. The app.py's _decode_wav_to_yamnet_input() function
    already does the WAV-bytes -> waveform decode you'd reuse here.
    """
    raise NotImplementedError("Point this at your labeled recordings once you have some.")


def extract_embeddings(yamnet_model, waveforms: list[np.ndarray]) -> np.ndarray:
    """
    Runs each waveform through YAMNet and mean-pools its per-frame
    embeddings into a single 1024-dim vector per clip — the standard
    YAMNet transfer-learning input.
    """
    embeddings = []
    for waveform in waveforms:
        _scores, clip_embeddings, _spectrogram = yamnet_model(waveform)
        embeddings.append(clip_embeddings.numpy().mean(axis=0))
    return np.stack(embeddings)


def build_classifier_head() -> tf.keras.Model:
    """A small dense classifier on top of YAMNet's 1024-dim embeddings."""
    return tf.keras.Sequential([
        tf.keras.layers.Input(shape=(1024,)),
        tf.keras.layers.Dense(128, activation="relu"),
        tf.keras.layers.Dropout(0.3),
        tf.keras.layers.Dense(len(CATEGORIES), activation="softmax")
    ])


def main(dataset_dir: str, output_path: str = "classifier_head.keras"):
    yamnet_model = hub.load("https://tfhub.dev/google/yamnet/1")

    waveforms, labels = load_labeled_clips(dataset_dir)
    X = extract_embeddings(yamnet_model, waveforms)
    y = np.array([CATEGORIES.index(label) for label in labels])

    model = build_classifier_head()
    model.compile(optimizer="adam", loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    model.fit(X, y, epochs=20, validation_split=0.2)
    model.save(output_path)
    print(f"Saved fine-tuned classifier head to {output_path}")
    print("Wire it into app.py's /classify handler in place of category_mapping's keyword bucketing.")


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python finetune_stub.py <dataset_dir>")
        raise SystemExit(1)
    main(sys.argv[1])
