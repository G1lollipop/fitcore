"""
HTML file parser.
"""

from typing import Dict, Any, Optional
from .base_parser import BaseFileParser


class HtmlParser(BaseFileParser):
    """HTML file parser."""

    def parse(self, file_content: bytes, filename: str, **kwargs) -> Dict[str, Any]:
        """Parse an HTML file."""
        try:
            from bs4 import BeautifulSoup

            html_text = self._safe_decode(file_content)
            soup = BeautifulSoup(html_text, "html.parser")

            # Remove script and style tags.
            for script in soup(["script", "style", "noscript"]):
                script.decompose()

            # Extract text content.
            text = soup.get_text(separator="\n", strip=True)

            # Extract metadata.
            metadata = self._extract_basic_metadata(filename)
            metadata["file_type"] = "text/html"
            metadata["character_count"] = len(text)

            # HTML document metadata.
            if soup.title:
                metadata["title"] = soup.title.string

            # Meta tags.
            meta_tags = soup.find_all("meta")
            for meta in meta_tags:
                name = meta.get("name") or meta.get("property")
                content = meta.get("content")
                if name and content:
                    if name.lower() in ["description", "keywords", "author"]:
                        metadata[name.lower()] = content
                    elif name.startswith("og:"):
                        metadata[f"og_{name[3:]}"] = content

            # Count HTML elements.
            metadata["link_count"] = len(soup.find_all("a"))
            metadata["image_count"] = len(soup.find_all("img"))
            metadata["heading_count"] = len(
                soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6"])
            )

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
                "error": "beautifulsoup4 is not installed; please run: pip install beautifulsoup4",
            }
        except Exception as e:
            return {
                "text": "",
                "metadata": self._extract_basic_metadata(filename),
                "success": False,
                "error": f"HTML parsing failed: {str(e)}",
            }

    def can_parse(self, filename: str, mime_type: Optional[str] = None) -> bool:
        """Determine whether the file is an HTML file."""
        if mime_type:
            return mime_type in ["text/html", "application/xhtml+xml"]
        return filename.lower().endswith((".html", ".htm", ".xhtml"))
