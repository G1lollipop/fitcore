"""
健身博客爬虫示例
这是一个示例实现，展示如何创建自定义爬虫
"""
from typing import List, Dict, Any, Optional
from .base_crawler import BaseCrawler, CrawlerResult


class FitnessBlogCrawler(BaseCrawler):
    """
    健身博客爬虫示例
    
    注意：这是一个示例实现，实际使用时需要：
    1. 根据目标网站结构调整解析逻辑
    2. 遵守网站的 robots.txt 和使用条款
    3. 添加适当的延迟和错误处理
    4. 考虑使用 API 而非爬虫（如果网站提供）
    """
    
    def __init__(self, base_url: str = None):
        """
        Args:
            base_url: 博客基础 URL（可选，可在 crawl 方法中指定）
        """
        super().__init__(name="FitnessBlogCrawler", base_url=base_url)
    
    def crawl(self, urls: Optional[List[str]] = None, 
              max_pages: int = 10, **kwargs) -> List[CrawlerResult]:
        """
        爬取健身博客文章
        
        Args:
            urls: 要爬取的 URL 列表（如果为 None，则从 base_url 开始爬取）
            max_pages: 最大爬取页数
            **kwargs: 其他参数
        
        Returns:
            爬取结果列表
        """
        results = []
        
        # 如果提供了 URL 列表，直接爬取
        if urls:
            for url in urls[:max_pages]:
                result = self._crawl_single_page(url)
                if result:
                    results.append(result)
            return results
        
        # 否则，从 base_url 开始爬取（需要实现列表页解析）
        if self.base_url:
            # 示例：爬取列表页，提取文章链接，然后爬取每篇文章
            # 这里简化处理，实际需要根据网站结构调整
            article_urls = self._extract_article_urls(self.base_url, max_pages)
            for url in article_urls:
                result = self._crawl_single_page(url)
                if result:
                    results.append(result)
        
        return results
    
    def _crawl_single_page(self, url: str) -> Optional[CrawlerResult]:
        """爬取单个页面"""
        html_content = self._make_request(url)
        if not html_content:
            return None
        
        try:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # 提取标题（根据网站结构调整选择器）
            title_elem = soup.find('h1') or soup.find('title')
            title = title_elem.get_text(strip=True) if title_elem else "无标题"
            
            # 提取正文（根据网站结构调整选择器）
            # 常见选择器：article, .content, .post-content, main 等
            content_elem = soup.find('article') or soup.find('main') or soup.find('div', class_='content')
            if content_elem:
                # 移除不需要的元素
                for tag in content_elem.find_all(['script', 'style', 'nav', 'footer', 'aside']):
                    tag.decompose()
                content = content_elem.get_text(separator='\n', strip=True)
            else:
                # 如果没有找到特定容器，提取整个页面的文本
                content = self._extract_text_from_html(html_content)
            
            # 提取元数据
            metadata = {
                'source_site': self._extract_domain(url),
                'crawler_name': self.name,
            }
            
            # 尝试提取作者、发布时间等（根据网站结构调整）
            author_elem = soup.find('span', class_='author') or soup.find('meta', {'name': 'author'})
            if author_elem:
                metadata['author'] = author_elem.get('content') or author_elem.get_text(strip=True)
            
            date_elem = soup.find('time') or soup.find('span', class_='date')
            if date_elem:
                metadata['publish_date'] = date_elem.get('datetime') or date_elem.get_text(strip=True)
            
            return CrawlerResult(
                url=url,
                title=title,
                content=content,
                metadata=metadata,
            )
        except Exception as e:
            print(f"[{self.name}] 解析页面失败 {url}: {str(e)}")
            return None
    
    def _extract_article_urls(self, list_url: str, max_pages: int) -> List[str]:
        """
        从列表页提取文章 URL
        
        注意：这是一个示例方法，实际需要根据目标网站结构调整
        """
        urls = []
        html_content = self._make_request(list_url)
        if not html_content:
            return urls
        
        try:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # 根据网站结构调整选择器
            # 常见：a.article-link, .post-title a, article a 等
            links = soup.find_all('a', href=True)
            for link in links[:max_pages * 10]:  # 假设每页约10篇文章
                href = link.get('href')
                if href:
                    # 处理相对 URL
                    if href.startswith('/'):
                        base_domain = self._extract_domain(list_url)
                        href = f"{base_domain}{href}"
                    elif not href.startswith('http'):
                        continue
                    
                    urls.append(href)
            
            return list(set(urls))[:max_pages]  # 去重并限制数量
        except Exception as e:
            print(f"[{self.name}] 提取文章链接失败: {str(e)}")
            return []
    
    def _extract_domain(self, url: str) -> str:
        """提取域名"""
        from urllib.parse import urlparse
        parsed = urlparse(url)
        return f"{parsed.scheme}://{parsed.netloc}"
    
    def get_source_info(self) -> Dict[str, Any]:
        """获取数据源信息"""
        return {
            'name': self.name,
            'type': 'blog',
            'description': '健身博客爬虫（示例实现）',
            'base_url': self.base_url,
        }
