"""
In-memory MD5 dedupe set, persisted to md5.text via append.

The file format is unchanged (one md5 per line) so any pre-existing md5.text
keeps working. Lookup is now O(1); save_md5 is idempotent and append-only.
"""
import hashlib
import os
import threading

from app.core import constants as config


_seen: set[str] | None = None
_lock = threading.Lock()


def _ensure_loaded() -> set[str]:
    """Lazy-load md5.text into a set on first access. Thread-safe."""
    global _seen
    if _seen is not None:
        return _seen
    with _lock:
        if _seen is not None:
            return _seen
        cache: set[str] = set()
        if os.path.exists(config.md5_path):
            with open(config.md5_path, "r", encoding="utf-8") as f:
                for line in f:
                    h = line.strip()
                    if h:
                        cache.add(h)
        else:
            # Touch the file so legacy callers that expect it to exist don't trip.
            open(config.md5_path, "w", encoding="utf-8").close()
        _seen = cache
    return _seen


def reset_md5_cache() -> None:
    """Test hook — drops the in-memory set so the next call re-reads the file."""
    global _seen
    with _lock:
        _seen = None


def get_string_md5(input_str: str, encoding: str = "utf-8") -> str:
    str_bytes = input_str.encode(encoding=encoding)
    md5_obj = hashlib.md5()
    md5_obj.update(str_bytes)
    return md5_obj.hexdigest()


def check_md5(md5_str: str) -> bool:
    return md5_str in _ensure_loaded()


def save_md5(md5_str: str) -> None:
    cache = _ensure_loaded()
    if md5_str in cache:
        return
    with _lock:
        if md5_str in cache:
            return
        with open(config.md5_path, "a", encoding="utf-8") as f:
            f.write(md5_str + "\n")
        cache.add(md5_str)
