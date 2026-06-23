"""
Abstract base class for file parsers.
"""

from abc import ABC, abstractmethod
from typing import Dict, Optional, Any


class BaseFileParser(ABC):
    """Abstract base class for file parsers."""

    def __init__(self):
        """Initialize the parser."""
        pass

    @abstractmethod
    def parse(self, file_content: bytes, filename: str, **kwargs) -> Dict[str, Any]:
        """
        Parse file content, extracting text and metadata.

        Args:
            file_content: Binary content of the file
            filename: File name
            **kwargs: Extra arguments (e.g. encoding, image extraction)

        Returns:
            Dict with the following keys:
                - 'text': str, extracted text content
                - 'metadata': dict, file metadata (e.g. author, creation time)
                - 'success': bool, whether parsing succeeded
                - 'error': str, error message (if it failed)
        """
        pass

    @abstractmethod
    def can_parse(self, filename: str, mime_type: Optional[str] = None) -> bool:
        """
        Determine whether this parser can handle the file.

        Args:
            filename: File name
            mime_type: MIME type (optional)

        Returns:
            bool: whether the file can be parsed
        """
        pass

    def _extract_basic_metadata(self, filename: str) -> Dict[str, Any]:
        """
        Extract basic metadata (file name, extension, etc.).

        Args:
            filename: File name

        Returns:
            Basic metadata dictionary
        """
        from pathlib import Path

        path = Path(filename)
        return {
            "filename": filename,
            "file_extension": path.suffix.lower(),
            "file_stem": path.stem,
        }

    def _safe_decode(self, content: bytes, encodings: list = None) -> str:
        """
        Safely decode byte content, trying multiple encodings.

        Args:
            content: Byte content
            encodings: List of encodings, defaults to ['utf-8', 'gbk', 'gb2312', 'latin-1']

        Returns:
            The decoded string
        """
        if encodings is None:
            encodings = ["utf-8", "gbk", "gb2312", "latin-1"]

        for encoding in encodings:
            try:
                return content.decode(encoding)
            except UnicodeDecodeError:
                continue

        # If every encoding fails, force-decode with errors='ignore'.
        return content.decode("utf-8", errors="ignore")
