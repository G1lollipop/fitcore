"""
文件解析器抽象基类
"""
from abc import ABC, abstractmethod
from typing import Dict, Optional, Any


class BaseFileParser(ABC):
    """文件解析器抽象基类"""
    
    def __init__(self):
        """初始化解析器"""
        pass
    
    @abstractmethod
    def parse(self, file_content: bytes, filename: str, **kwargs) -> Dict[str, Any]:
        """
        解析文件内容，提取文本和元数据
        
        Args:
            file_content: 文件的二进制内容
            filename: 文件名
            **kwargs: 额外参数（如编码、提取图片等）
        
        Returns:
            Dict包含以下键：
                - 'text': str, 提取的文本内容
                - 'metadata': dict, 文件元数据（如作者、创建时间等）
                - 'success': bool, 是否解析成功
                - 'error': str, 错误信息（如果失败）
        """
        pass
    
    @abstractmethod
    def can_parse(self, filename: str, mime_type: Optional[str] = None) -> bool:
        """
        判断是否能解析该文件
        
        Args:
            filename: 文件名
            mime_type: MIME类型（可选）
        
        Returns:
            bool: 是否能解析
        """
        pass
    
    def _extract_basic_metadata(self, filename: str) -> Dict[str, Any]:
        """
        提取基础元数据（文件名、扩展名等）
        
        Args:
            filename: 文件名
        
        Returns:
            基础元数据字典
        """
        from pathlib import Path
        
        path = Path(filename)
        return {
            'filename': filename,
            'file_extension': path.suffix.lower(),
            'file_stem': path.stem,
        }
    
    def _safe_decode(self, content: bytes, encodings: list = None) -> str:
        """
        安全解码字节内容，尝试多种编码
        
        Args:
            content: 字节内容
            encodings: 编码列表，默认 ['utf-8', 'gbk', 'gb2312', 'latin-1']
        
        Returns:
            解码后的字符串
        """
        if encodings is None:
            encodings = ['utf-8', 'gbk', 'gb2312', 'latin-1']
        
        for encoding in encodings:
            try:
                return content.decode(encoding)
            except UnicodeDecodeError:
                continue
        
        # 如果所有编码都失败，使用 errors='ignore' 强制解码
        return content.decode('utf-8', errors='ignore')
