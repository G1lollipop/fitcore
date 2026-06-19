"""
Markdown 文件解析器
"""

from typing import Dict, Any, Optional
from .base_parser import BaseFileParser


class MarkdownParser(BaseFileParser):
    """Markdown 文件解析器"""

    def parse(self, file_content: bytes, filename: str, **kwargs) -> Dict[str, Any]:
        """解析 Markdown 文件"""
        try:
            # Markdown 文件直接解码为文本
            # 如果需要去除 Markdown 语法，可以使用 markdown 库
            text = self._safe_decode(file_content)

            # 可选：提取 Markdown 元数据（Front Matter）
            metadata = self._extract_basic_metadata(filename)
            metadata["file_type"] = "text/markdown"
            metadata["character_count"] = len(text)
            metadata["line_count"] = len(text.splitlines())

            # 尝试提取 YAML Front Matter
            front_matter = self._extract_front_matter(text)
            if front_matter:
                metadata.update(front_matter)

            # 统计 Markdown 元素
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
                "error": f"Markdown 解析失败: {str(e)}",
            }

    def _extract_front_matter(self, text: str) -> Optional[Dict[str, Any]]:
        """
        提取 YAML Front Matter（如果存在）

        Args:
            text: Markdown 文本

        Returns:
            Front Matter 字典或 None
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
            # PyYAML 未安装，跳过 Front Matter 提取
            pass
        except Exception:
            # Front Matter 解析失败，忽略
            pass

        return None

    def can_parse(self, filename: str, mime_type: Optional[str] = None) -> bool:
        """判断是否为 Markdown 文件"""
        if mime_type:
            return mime_type in ["text/markdown", "text/x-markdown"]
        return filename.lower().endswith((".md", ".markdown"))
