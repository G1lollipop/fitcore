"""
爬虫服务入口
用于启动和管理爬虫调度器
"""
import sys
from typing import Optional

from app.core import constants as config
from app.services.kb_service import KnowledgeBaseService
from crawlers import CrawlerScheduler, BaseCrawler
from crawlers.crawler_scheduler import CrawlerTask
from crawlers.fitness_blog_crawler import FitnessBlogCrawler


def create_crawler_from_config(task_config: dict) -> Optional[BaseCrawler]:
    """
    根据配置创建爬虫实例
    
    Args:
        task_config: 任务配置字典
    
    Returns:
        爬虫实例
    """
    crawler_class_name = task_config.get('crawler_class', '')
    base_url = task_config.get('base_url')
    
    # 根据类名创建爬虫（可以扩展支持更多爬虫类型）
    if crawler_class_name == 'FitnessBlogCrawler':
        return FitnessBlogCrawler(base_url=base_url)
    
    print(f"[CrawlerService] 未知的爬虫类型: {crawler_class_name}")
    return None


def setup_crawler_service(knowledge_base_service: KnowledgeBaseService) -> CrawlerScheduler:
    """
    设置爬虫服务
    
    Args:
        knowledge_base_service: 知识库服务实例
    
    Returns:
        配置好的调度器
    """
    scheduler = CrawlerScheduler()
    
    # 定义结果回调函数：将爬取结果写入知识库
    def on_crawl_result(task: CrawlerTask, results):
        """爬取结果回调"""
        print(f"[CrawlerService] 处理 {len(results)} 条爬取结果")
        
        for result in results:
            # 构建文件名（使用标题和URL）
            filename = f"{result.title}_{result.url.split('/')[-1]}.txt"
            if len(filename) > 200:  # 限制文件名长度
                filename = filename[:200] + ".txt"
            
            # 构建元数据
            extra_metadata = result.metadata.copy()
            extra_metadata['title'] = result.title
            extra_metadata['operator'] = 'Crawler'
            
            # 上传到知识库
            upload_result = knowledge_base_service.upload_by_str(
                data=result.content,
                filename=filename,
                extra_metadata=extra_metadata,
            )
            print(f"[CrawlerService] {filename}: {upload_result}")
    
    scheduler.register_callback(on_crawl_result)
    
    # 从配置加载任务
    if config.CRAWLER_ENABLED and config.CRAWLER_TASKS:
        for task_config in config.CRAWLER_TASKS:
            if not task_config.get('enabled', True):
                continue
            
            crawler = create_crawler_from_config(task_config)
            if crawler:
                task = CrawlerTask(
                    crawler=crawler,
                    interval_hours=task_config.get('interval_hours', 24),
                    enabled=task_config.get('enabled', True),
                    **task_config.get('kwargs', {}),
                )
                scheduler.add_task(task)
                print(f"[CrawlerService] 已添加任务: {crawler.name}")
    
    return scheduler


def main():
    """主函数：启动爬虫服务"""
    print("[CrawlerService] 初始化知识库服务...")
    kb_service = KnowledgeBaseService()
    
    print("[CrawlerService] 设置爬虫调度器...")
    scheduler = setup_crawler_service(kb_service)
    
    if not scheduler.tasks:
        print("[CrawlerService] 没有配置的爬虫任务，退出")
        return
    
    print("[CrawlerService] 启动调度器...")
    scheduler.start(daemon=False)
    
    try:
        # 保持运行
        while True:
            import time
            time.sleep(60)
    except KeyboardInterrupt:
        print("\n[CrawlerService] 收到停止信号，正在关闭...")
        scheduler.stop()
        print("[CrawlerService] 已退出")


if __name__ == '__main__':
    main()
