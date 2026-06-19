"""
PDF 文件解析器
"""
from typing import Dict, Any, Optional
from .base_parser import BaseFileParser


class PdfParser(BaseFileParser):
    """PDF 文件解析器"""
    
    def parse(self, file_content: bytes, filename: str, **kwargs) -> Dict[str, Any]:
        """解析 PDF 文件"""
        try:
            from pypdf import PdfReader
            from io import BytesIO
            
            pdf_file = BytesIO(file_content)
            pdf_reader = PdfReader(pdf_file)
            
            # 提取所有页面的文本
            text_parts = []
            for page_num, page in enumerate(pdf_reader.pages, 1):
                try:
                    text_parts.append(page.extract_text())
                except Exception as e:
                    # 如果某页提取失败，记录但继续
                    text_parts.append(f"[页面 {page_num} 提取失败: {str(e)}]")
            
            text = '\n\n'.join(text_parts)
            
            # 提取 PDF 元数据
            metadata = self._extract_basic_metadata(filename)
            metadata['file_type'] = 'application/pdf'
            metadata['page_count'] = len(pdf_reader.pages)
            metadata['character_count'] = len(text)
            
            # PDF 文档元数据
            if pdf_reader.metadata:
                pdf_meta = pdf_reader.metadata
                if pdf_meta.get('/Title'):
                    metadata['title'] = pdf_meta['/Title']
                if pdf_meta.get('/Author'):
                    metadata['author'] = pdf_meta['/Author']
                if pdf_meta.get('/Subject'):
                    metadata['subject'] = pdf_meta['/Subject']
                if pdf_meta.get('/CreationDate'):
                    metadata['creation_date'] = str(pdf_meta['/CreationDate'])
            
            return {
                'text': text,
                'metadata': metadata,
                'success': True,
                'error': None,
            }
        except ImportError:
            return {
                'text': '',
                'metadata': self._extract_basic_metadata(filename),
                'success': False,
                'error': 'pypdf 未安装，请运行: pip install pypdf',
            }
        except Exception as e:
            return {
                'text': '',
                'metadata': self._extract_basic_metadata(filename),
                'success': False,
                'error': f'PDF 解析失败: {str(e)}',
            }
    
    def can_parse(self, filename: str, mime_type: Optional[str] = None) -> bool:
        """判断是否为 PDF 文件"""
        if mime_type:
            return mime_type == 'application/pdf'
        return filename.lower().endswith('.pdf')
