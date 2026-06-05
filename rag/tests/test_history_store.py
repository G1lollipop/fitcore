"""Session-id sanitization for the file-backed chat history (path traversal)."""

from __future__ import annotations

import uuid

import pytest

from app.services.history_store import FileChatMessageHistory, get_history


@pytest.mark.parametrize(
    "bad",
    [
        "../escape",
        "../../etc/passwd",
        "a/b",
        "a\\b",
        "..",
        ".",
        "",
        "with space",
        "with.dot",
        "x" * 129,  # too long
    ],
)
def test_rejects_unsafe_session_ids(bad, tmp_path):
    with pytest.raises(ValueError):
        FileChatMessageHistory(bad, str(tmp_path))


@pytest.mark.parametrize(
    "ok",
    [
        "anonymous",
        "user_123",
        "abc-DEF-456",
        uuid.uuid4().hex,
        str(uuid.uuid4()),
    ],
)
def test_accepts_safe_session_ids(ok, tmp_path):
    history = FileChatMessageHistory(ok, str(tmp_path))
    # Resolved path must stay inside the storage directory.
    assert history.file_path.startswith(str(tmp_path.resolve()))


def test_get_history_rejects_traversal():
    with pytest.raises(ValueError):
        get_history("../../secret")
