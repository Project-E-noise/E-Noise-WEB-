"""
Repairs a half-downloaded YAMNet in the TensorFlow Hub cache.

If a download is interrupted (laptop asleep, Wi-Fi drop), TF Hub leaves the
model folder behind without its saved_model.pb. Every later start then fails
with "... contains neither 'saved_model.pb' nor 'saved_model.pbtxt'" until
that folder is deleted. broken_cache_dir() finds that folder from the error
message, and only returns it when it really is an incomplete model folder
inside the TF Hub cache, so nothing else can ever be deleted.

No TensorFlow import here, so the tests can check it quickly.
"""

import os
import re
import tempfile

_BROKEN = re.compile(r"'([^']+)' contains neither 'saved_model\.pb' nor 'saved_model\.pbtxt'")


def tfhub_cache_root() -> str:
    """Where TF Hub keeps downloaded models: TFHUB_CACHE_DIR, else <temp>/tfhub_modules."""
    return os.environ.get("TFHUB_CACHE_DIR") or os.path.join(tempfile.gettempdir(), "tfhub_modules")


def broken_cache_dir(error_message: str, cache_root: str | None = None) -> str | None:
    """Returns the incomplete model folder named in a TF Hub load error, or None."""
    match = _BROKEN.search(error_message)
    if not match:
        return None
    folder = os.path.realpath(match.group(1))
    root = os.path.realpath(cache_root or tfhub_cache_root())
    if os.path.dirname(folder) != root:
        return None  # not a model folder directly inside the TF Hub cache
    if not os.path.isdir(folder):
        return None
    if os.path.exists(os.path.join(folder, "saved_model.pb")) or os.path.exists(os.path.join(folder, "saved_model.pbtxt")):
        return None  # not actually incomplete
    return folder
