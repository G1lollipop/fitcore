"""
TXT file parser.
"""

from typing import Dict, Any, Optional
from .base_parser import BaseFileParser


class TxtParser(BaseFileParser):
    """TXT file parser."""

    def parse(self, file_content: bytes, filename: str, **kwargs) -> Dict[str, Any]:
        """Parse a TXT file."""
        try:
            # Try to read the encoding from kwargs; otherwise use safe decoding.
            encoding = kwargs.get("encoding", None)
            if encoding:
                text = file_content.decode(encoding)
            else:
                text = self._safe_decode(file_content)

            metadata = self._extract_basic_metadata(filename)
            metadata["file_type"] = "text/plain"
            metadata["character_count"] = len(text)
            metadata["line_count"] = len(text.splitlines())

            return {
                "text": text,
                "metadata": metadata,
                "success": True,
                "error": None,
            }
        except Exception as e:
            return {
                "text": "",
                "metadata": self._extract_basic_metadata(filename),
                "success": False,
                "error": str(e),
            }

    def can_parse(self, filename: str, mime_type: Optional[str] = None) -> bool:
        """Determine whether the file is a TXT file."""
        if mime_type:
            return mime_type in ["text/plain", "text/txt"]
        return filename.lower().endswith(".txt")
