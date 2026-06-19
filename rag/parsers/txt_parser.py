"""
TXT 文件解析器
"""

from typing import Dict, Any, Optional
from .base_parser import BaseFileParser


class TxtParser(BaseFileParser):
    """TXT 文件解析器"""

    def parse(self, file_content: bytes, filename: str, **kwargs) -> Dict[str, Any]:
        """解析 TXT 文件"""
        try:
            # 尝试从 kwargs 获取编码，默认使用安全解码
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
        """判断是否为 TXT 文件"""
        if mime_type:
            return mime_type in ["text/plain", "text/txt"]
        return filename.lower().endswith(".txt")
