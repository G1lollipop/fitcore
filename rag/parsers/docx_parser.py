"""
Word (DOCX) 文件解析器
"""
from typing import Dict, Any, Optional
from .base_parser import BaseFileParser


class DocxParser(BaseFileParser):
    """DOCX 文件解析器"""
    
    def parse(self, file_content: bytes, filename: str, **kwargs) -> Dict[str, Any]:
        """解析 DOCX 文件"""
        try:
            from docx import Document
            from io import BytesIO
            
            docx_file = BytesIO(file_content)
            doc = Document(docx_file)
            
            # 提取所有段落文本
            paragraphs = [para.text for para in doc.paragraphs if para.text.strip()]
            text = '\n\n'.join(paragraphs)
            
            # 提取表格文本
            table_texts = []
            for table in doc.tables:
                for row in table.rows:
                    row_texts = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                    if row_texts:
                        table_texts.append(' | '.join(row_texts))
            
            if table_texts:
                text += '\n\n[表格内容]\n' + '\n'.join(table_texts)
            
            # 提取元数据
            metadata = self._extract_basic_metadata(filename)
            metadata['file_type'] = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            metadata['paragraph_count'] = len(paragraphs)
            metadata['table_count'] = len(doc.tables)
            metadata['character_count'] = len(text)
            
            # Word 文档属性
            core_props = doc.core_properties
            if core_props.title:
                metadata['title'] = core_props.title
            if core_props.author:
                metadata['author'] = core_props.author
            if core_props.subject:
                metadata['subject'] = core_props.subject
            if core_props.created:
                metadata['creation_date'] = core_props.created.isoformat()
            if core_props.modified:
                metadata['modified_date'] = core_props.modified.isoformat()
            
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
                'error': 'python-docx 未安装，请运行: pip install python-docx',
            }
        except Exception as e:
            return {
                'text': '',
                'metadata': self._extract_basic_metadata(filename),
                'success': False,
                'error': f'DOCX 解析失败: {str(e)}',
            }
    
    def can_parse(self, filename: str, mime_type: Optional[str] = None) -> bool:
        """判断是否为 DOCX 文件"""
        if mime_type:
            return mime_type in [
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/msword',
            ]
        return filename.lower().endswith(('.docx', '.doc'))
