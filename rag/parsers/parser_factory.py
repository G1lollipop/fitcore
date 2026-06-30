"""
File parser factory.
Automatically selects the appropriate parser.
"""

from typing import Optional, Dict, Any
from .base_parser import BaseFileParser
from .txt_parser import TxtParser
from .pdf_parser import PdfParser
from .docx_parser import DocxParser
from .markdown_parser import MarkdownParser
from .html_parser import HtmlParser


class FileParserFactory:
    """File parser factory class."""

    # Register all available parsers.
    _parsers: list[BaseFileParser] = [
        TxtParser(),
        PdfParser(),
        DocxParser(),
        MarkdownParser(),
        HtmlParser(),
    ]

    @classmethod
    def get_parser(
        cls, filename: str, mime_type: Optional[str] = None
    ) -> Optional[BaseFileParser]:
        """
        Get the appropriate parser based on file name and MIME type.

        Args:
            filename: File name
            mime_type: MIME type (optional)

        Returns:
            A parser instance, or None if none is found
        """
        for parser in cls._parsers:
            if parser.can_parse(filename, mime_type):
                return parser
        return None

    @classmethod
    def parse_file(
        cls,
        file_content: bytes,
        filename: str,
        mime_type: Optional[str] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """
        Parse a file, automatically selecting the appropriate parser.

        Args:
            file_content: Binary content of the file
            filename: File name
            mime_type: MIME type (optional)
            **kwargs: Extra arguments passed to the parser

        Returns:
            The parsing result dictionary (see BaseFileParser.parse)
        """
        parser = cls.get_parser(filename, mime_type)

        if parser is None:
            return {
                "text": "",
                "metadata": {"filename": filename},
                "success": False,
                "error": f"Unsupported file type: {filename}",
            }

        return parser.parse(file_content, filename, **kwargs)
