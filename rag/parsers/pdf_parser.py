"""
PDF file parser.
"""

from typing import Dict, Any, Optional
from .base_parser import BaseFileParser


class PdfParser(BaseFileParser):
    """PDF file parser."""

    def parse(self, file_content: bytes, filename: str, **kwargs) -> Dict[str, Any]:
        """Parse a PDF file."""
        try:
            from pypdf import PdfReader
            from io import BytesIO

            pdf_file = BytesIO(file_content)
            pdf_reader = PdfReader(pdf_file)

            # Extract text from every page.
            text_parts = []
            for page_num, page in enumerate(pdf_reader.pages, 1):
                try:
                    text_parts.append(page.extract_text())
                except Exception as e:
                    # If a page fails to extract, record it but keep going.
                    text_parts.append(f"[Page {page_num} extraction failed: {str(e)}]")

            text = "\n\n".join(text_parts)

            # Extract PDF metadata.
            metadata = self._extract_basic_metadata(filename)
            metadata["file_type"] = "application/pdf"
            metadata["page_count"] = len(pdf_reader.pages)
            metadata["character_count"] = len(text)

            # PDF document metadata.
            if pdf_reader.metadata:
                pdf_meta = pdf_reader.metadata
                if pdf_meta.get("/Title"):
                    metadata["title"] = pdf_meta["/Title"]
                if pdf_meta.get("/Author"):
                    metadata["author"] = pdf_meta["/Author"]
                if pdf_meta.get("/Subject"):
                    metadata["subject"] = pdf_meta["/Subject"]
                if pdf_meta.get("/CreationDate"):
                    metadata["creation_date"] = str(pdf_meta["/CreationDate"])

            return {
                "text": text,
                "metadata": metadata,
                "success": True,
                "error": None,
            }
        except ImportError:
            return {
                "text": "",
                "metadata": self._extract_basic_metadata(filename),
                "success": False,
                "error": "pypdf is not installed; please run: pip install pypdf",
            }
        except Exception as e:
            return {
                "text": "",
                "metadata": self._extract_basic_metadata(filename),
                "success": False,
                "error": f"PDF parsing failed: {str(e)}",
            }

    def can_parse(self, filename: str, mime_type: Optional[str] = None) -> bool:
        """Determine whether the file is a PDF file."""
        if mime_type:
            return mime_type == "application/pdf"
        return filename.lower().endswith(".pdf")
