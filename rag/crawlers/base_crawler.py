"""
爬虫抽象基类
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from datetime import datetime


class CrawlerResult:
    """爬虫结果数据类"""
    
    def __init__(self, url: str, title: str, content: str, 
                 metadata: Optional[Dict[str, Any]] = None):
        """
        Args:
            url: 源 URL
            title: 文章标题
            content: 文章内容（纯文本）
            metadata: 额外元数据（作者、发布时间、标签等）
        """
        self.url = url
        self.title = title
        self.content = content
        self.metadata = metadata or {}
        self.metadata['crawl_time'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self.metadata['source_url'] = url
        self.metadata['source_type'] = 'crawler'
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式"""
        return {
            'url': self.url,
            'title': self.title,
            'content': self.content,
            'metadata': self.metadata,
        }


class BaseCrawler(ABC):
    """爬虫抽象基类"""
    
    def __init__(self, name: str, base_url: Optional[str] = None):
        """
        Args:
            name: 爬虫名称（用于日志和标识）
            base_url: 基础 URL（可选）
        """
        self.name = name
        self.base_url = base_url
        self.session = None  # 可以在这里初始化 requests session
    
    @abstractmethod
    def crawl(self, **kwargs) -> List[CrawlerResult]:
        """
        执行爬取操作
        
        Args:
            **kwargs: 爬虫特定参数（如关键词、日期范围等）
        
        Returns:
            爬取结果列表
        """
        pass
    
    @abstractmethod
    def get_source_info(self) -> Dict[str, Any]:
        """
        获取数据源信息
        
        Returns:
            包含数据源描述的字典（如站点名、描述等）
        """
        pass
    
    def _make_request(self, url: str, headers: Optional[Dict] = None, 
                     timeout: int = 30) -> Optional[bytes]:
        """
        发送 HTTP 请求（通用方法）
        
        Args:
            url: 请求 URL
            headers: 请求头
            timeout: 超时时间（秒）
        
        Returns:
            响应内容（字节），失败返回 None
        """
        try:
            import requests
            if headers is None:
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            
            response = requests.get(url, headers=headers, timeout=timeout)
            response.raise_for_status()
            return response.content
        except ImportError:
            raise ImportError("requests 库未安装，请运行: pip install requests")
        except Exception as e:
            print(f"[{self.name}] 请求失败 {url}: {str(e)}")
            return None
    
    def _extract_text_from_html(self, html_content: bytes, 
                                selector: Optional[str] = None) -> str:
        """
        从 HTML 中提取文本（通用方法）
        
        Args:
            html_content: HTML 字节内容
            selector: CSS 选择器（可选，用于定位特定元素）
        
        Returns:
            提取的文本
        """
        try:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # 移除 script 和 style
            for tag in soup(['script', 'style', 'noscript']):
                tag.decompose()
            
            if selector:
                element = soup.select_one(selector)
                if element:
                    return element.get_text(separator='\n', strip=True)
            
            return soup.get_text(separator='\n', strip=True)
        except ImportError:
            raise ImportError("beautifulsoup4 库未安装，请运行: pip install beautifulsoup4")
        except Exception as e:
            print(f"[{self.name}] HTML 解析失败: {str(e)}")
            return ""
