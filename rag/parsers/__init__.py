"""
File parser module.
Supports text extraction from multiple file formats.
"""

from .base_parser import BaseFileParser
from .txt_parser import TxtParser
from .pdf_parser import PdfParser
from .docx_parser import DocxParser
from .markdown_parser import MarkdownParser
from .html_parser import HtmlParser
from .parser_factory import FileParserFactory

__all__ = [
    "BaseFileParser",
    "TxtParser",
    "PdfParser",
    "DocxParser",
    "MarkdownParser",
    "HtmlParser",
    "FileParserFactory",
]
