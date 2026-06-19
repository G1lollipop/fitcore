"""
文件解析器工厂
自动选择合适的解析器
"""

from typing import Optional, Dict, Any
from .base_parser import BaseFileParser
from .txt_parser import TxtParser
from .pdf_parser import PdfParser
from .docx_parser import DocxParser
from .markdown_parser import MarkdownParser
from .html_parser import HtmlParser


class FileParserFactory:
    """文件解析器工厂类"""

    # 注册所有可用的解析器
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
        根据文件名和 MIME 类型获取合适的解析器

        Args:
            filename: 文件名
            mime_type: MIME 类型（可选）

        Returns:
            解析器实例，如果找不到则返回 None
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
        解析文件，自动选择合适的解析器

        Args:
            file_content: 文件的二进制内容
            filename: 文件名
            mime_type: MIME 类型（可选）
            **kwargs: 传递给解析器的额外参数

        Returns:
            解析结果字典（见 BaseFileParser.parse）
        """
        parser = cls.get_parser(filename, mime_type)

        if parser is None:
            return {
                "text": "",
                "metadata": {"filename": filename},
                "success": False,
                "error": f"不支持的文件类型: {filename}",
            }

        return parser.parse(file_content, filename, **kwargs)

    @classmethod
    def register_parser(cls, parser: BaseFileParser):
        """
        注册新的解析器（用于扩展）

        Args:
            parser: 解析器实例
        """
        cls._parsers.append(parser)

    @classmethod
    def get_supported_extensions(cls) -> list[str]:
        """
        获取所有支持的文件扩展名

        Returns:
            扩展名列表（如 ['.txt', '.pdf', '.docx', ...]）
        """
        extensions = set()
        for parser in cls._parsers:
            # 通过测试常见扩展名来判断支持的类型
            test_names = [
                "test.txt",
                "test.pdf",
                "test.docx",
                "test.doc",
                "test.md",
                "test.markdown",
                "test.html",
                "test.htm",
            ]
            for test_name in test_names:
                if parser.can_parse(test_name):
                    ext = "." + test_name.split(".")[-1]
                    extensions.add(ext)
        return sorted(list(extensions))
