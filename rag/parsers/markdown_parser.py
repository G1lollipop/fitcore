"""
Markdown file parser.
"""

from typing import Dict, Any, Optional
from .base_parser import BaseFileParser


class MarkdownParser(BaseFileParser):
    """Markdown file parser."""

    def parse(self, file_content: bytes, filename: str, **kwargs) -> Dict[str, Any]:
        """Parse a Markdown file."""
        try:
            # Decode the Markdown file directly to text.
            # Use the markdown library if you need to strip Markdown syntax.
            text = self._safe_decode(file_content)

            # Optional: extract Markdown metadata (front matter).
            metadata = self._extract_basic_metadata(filename)
            metadata["file_type"] = "text/markdown"
            metadata["character_count"] = len(text)
            metadata["line_count"] = len(text.splitlines())

            # Try to extract YAML front matter.
            front_matter = self._extract_front_matter(text)
            if front_matter:
                metadata.update(front_matter)

            # Count Markdown elements.
            metadata["heading_count"] = text.count("#")
            metadata["code_block_count"] = text.count("```")
            metadata["link_count"] = text.count("](")

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
                "error": f"Markdown parsing failed: {str(e)}",
            }

    def _extract_front_matter(self, text: str) -> Optional[Dict[str, Any]]:
        """
        Extract YAML front matter (if present).

        Args:
            text: Markdown text

        Returns:
            Front matter dictionary or None
        """
        if not text.startswith("---"):
            return None

        try:
            import yaml

            lines = text.split("\n")
            if lines[0].strip() == "---":
                end_idx = None
                for i in range(1, len(lines)):
                    if lines[i].strip() == "---":
                        end_idx = i
                        break

                if end_idx:
                    front_matter_text = "\n".join(lines[1:end_idx])
                    return yaml.safe_load(front_matter_text) or {}
        except ImportError:
            # PyYAML is not installed; skip front matter extraction.
            pass
        except Exception:
            # Front matter parsing failed; ignore.
            pass

        return None

    def can_parse(self, filename: str, mime_type: Optional[str] = None) -> bool:
        """Determine whether the file is a Markdown file."""
        if mime_type:
            return mime_type in ["text/markdown", "text/x-markdown"]
        return filename.lower().endswith((".md", ".markdown"))
