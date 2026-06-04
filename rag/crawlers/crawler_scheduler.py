"""
爬虫调度器
支持定时执行爬虫任务
"""
import time
import threading
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from .base_crawler import BaseCrawler, CrawlerResult


class CrawlerTask:
    """爬虫任务配置"""
    
    def __init__(self, crawler: BaseCrawler, interval_hours: int = 24,
                 enabled: bool = True, **crawler_kwargs):
        """
        Args:
            crawler: 爬虫实例
            interval_hours: 执行间隔（小时）
            enabled: 是否启用
            **crawler_kwargs: 传递给爬虫的额外参数
        """
        self.crawler = crawler
        self.interval_hours = interval_hours
        self.enabled = enabled
        self.crawler_kwargs = crawler_kwargs
        self.last_run_time: Optional[datetime] = None
        self.next_run_time: Optional[datetime] = None
        self.run_count = 0
        self.error_count = 0
    
    def should_run(self) -> bool:
        """判断是否应该执行"""
        if not self.enabled:
            return False
        
        if self.next_run_time is None:
            return True
        
        return datetime.now() >= self.next_run_time
    
    def update_schedule(self):
        """更新下次执行时间"""
        self.last_run_time = datetime.now()
        self.next_run_time = self.last_run_time + timedelta(hours=self.interval_hours)


class CrawlerScheduler:
    """爬虫调度器"""
    
    def __init__(self):
        self.tasks: List[CrawlerTask] = []
        self.running = False
        self.thread: Optional[threading.Thread] = None
        self.callback = None  # 爬取结果回调函数
    
    def add_task(self, task: CrawlerTask):
        """添加爬虫任务"""
        self.tasks.append(task)
    
    def register_callback(self, callback):
        """
        注册结果回调函数
        
        Args:
            callback: 函数，接收 (task, results) 参数
        """
        self.callback = callback
    
    def start(self, daemon: bool = True):
        """启动调度器"""
        if self.running:
            return
        
        self.running = True
        self.thread = threading.Thread(target=self._run_loop, daemon=daemon)
        self.thread.start()
        print(f"[CrawlerScheduler] 调度器已启动，共 {len(self.tasks)} 个任务")
    
    def stop(self):
        """停止调度器"""
        self.running = False
        if self.thread:
            self.thread.join(timeout=5)
        print("[CrawlerScheduler] 调度器已停止")
    
    def _run_loop(self):
        """调度器主循环"""
        while self.running:
            try:
                for task in self.tasks:
                    if task.should_run():
                        self._execute_task(task)
                
                # 每 5 分钟检查一次
                time.sleep(300)
            except Exception as e:
                print(f"[CrawlerScheduler] 调度器错误: {str(e)}")
                time.sleep(60)
    
    def _execute_task(self, task: CrawlerTask):
        """执行单个任务"""
        print(f"[CrawlerScheduler] 执行任务: {task.crawler.name}")
        
        try:
            results = task.crawler.crawl(**task.crawler_kwargs)
            task.run_count += 1
            task.update_schedule()
            
            print(f"[CrawlerScheduler] {task.crawler.name} 爬取完成，获得 {len(results)} 条结果")
            
            # 调用回调函数
            if self.callback:
                self.callback(task, results)
        except Exception as e:
            task.error_count += 1
            print(f"[CrawlerScheduler] {task.crawler.name} 执行失败: {str(e)}")
    
    def run_once(self, task_name: Optional[str] = None):
        """
        立即执行一次任务（用于测试或手动触发）
        
        Args:
            task_name: 任务名称（如果为 None，执行所有任务）
        """
        for task in self.tasks:
            if task_name is None or task.crawler.name == task_name:
                self._execute_task(task)
    
    def get_status(self) -> List[Dict[str, Any]]:
        """获取所有任务状态"""
        status = []
        for task in self.tasks:
            status.append({
                'name': task.crawler.name,
                'enabled': task.enabled,
                'interval_hours': task.interval_hours,
                'last_run_time': task.last_run_time.isoformat() if task.last_run_time else None,
                'next_run_time': task.next_run_time.isoformat() if task.next_run_time else None,
                'run_count': task.run_count,
                'error_count': task.error_count,
            })
        return status
