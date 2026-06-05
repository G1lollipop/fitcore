"""
Per-session chat history persisted as append-only NDJSON.

Legacy format (a single JSON array rewritten on every turn) is still readable
so existing chat_history/* files keep working. New writes always append one
JSON-encoded message per line, turning add_messages from O(n) per call into
O(messages-being-added).
"""

import json
import os
import re
from pathlib import Path
from typing import Sequence

from langchain_core.chat_history import BaseChatMessageHistory
from langchain_core.messages import BaseMessage, message_to_dict, messages_from_dict

# Session ids become filenames, so restrict them to a safe, fixed alphabet to
# prevent path traversal / arbitrary file writes (e.g. "../../etc/passwd").
_SESSION_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


def get_history(session_id):
    return FileChatMessageHistory(session_id, "./chat_history")


class FileChatMessageHistory(BaseChatMessageHistory):
    def __init__(self, session_id, storage_path):
        if not isinstance(session_id, str) or not _SESSION_ID_RE.match(session_id):
            raise ValueError("invalid session id")

        self.session_id = session_id
        self.storage_path = storage_path

        storage_root = Path(storage_path).resolve()
        file_path = (storage_root / session_id).resolve()

        # Defense in depth: even with the regex above, ensure the resolved path
        # stays inside the storage directory.
        if storage_root != file_path.parent:
            raise ValueError("invalid session id")

        self.file_path = str(file_path)

        os.makedirs(self.storage_path, exist_ok=True)

    def add_messages(self, messages: Sequence[BaseMessage]) -> None:
        # If the file exists in legacy JSON-array form, migrate it to NDJSON
        # before appending so we don't end up with a hybrid file.
        if self._is_legacy_format():
            self._migrate_legacy_to_ndjson()

        with open(self.file_path, "a", encoding="utf-8") as f:
            for message in messages:
                f.write(json.dumps(message_to_dict(message), ensure_ascii=False))
                f.write("\n")

    @property
    def messages(self) -> list[BaseMessage]:
        if not os.path.exists(self.file_path):
            return []

        with open(self.file_path, "r", encoding="utf-8") as f:
            content = f.read()

        if not content.strip():
            return []

        # Legacy: a single JSON array per file (the pre-Phase-D format).
        if content.lstrip().startswith("["):
            messages_data = json.loads(content)
        else:
            messages_data = [
                json.loads(line) for line in content.splitlines() if line.strip()
            ]

        return messages_from_dict(messages_data)

    def clear(self) -> None:
        # Truncate; keeps the file in NDJSON-ready state (empty file is valid).
        open(self.file_path, "w", encoding="utf-8").close()

    # ── helpers ───────────────────────────────────────────────────────────

    def _is_legacy_format(self) -> bool:
        if not os.path.exists(self.file_path) or os.path.getsize(self.file_path) == 0:
            return False
        with open(self.file_path, "r", encoding="utf-8") as f:
            head = f.read(1024).lstrip()
        return head.startswith("[")

    def _migrate_legacy_to_ndjson(self) -> None:
        with open(self.file_path, "r", encoding="utf-8") as f:
            content = f.read()
        if not content.strip():
            return
        try:
            messages_data = json.loads(content)
        except json.JSONDecodeError:
            return
        with open(self.file_path, "w", encoding="utf-8") as f:
            for entry in messages_data:
                f.write(json.dumps(entry, ensure_ascii=False))
                f.write("\n")
