#!/usr/bin/env python3
"""
NeedleBot AI 简化记忆管理器
不需要外部依赖的轻量级版本
"""

import json
import time
import hashlib
import os
from datetime import datetime
from typing import Dict, List, Optional, Any
from collections import OrderedDict


class SimpleMemoryManager:
    """简化记忆管理器 - 无外部依赖"""
    
    def __init__(self, memory_dir: str = "./memory"):
        """
        初始化简化记忆管理器
        
        Args:
            memory_dir: 记忆存储目录
        """
        self.memory_dir = memory_dir
        os.makedirs(memory_dir, exist_ok=True)
        
        # 创建子目录
        self.subdirs = ['short_term', 'mid_term', 'long_term', 'conversations']
        for subdir in self.subdirs:
            os.makedirs(os.path.join(memory_dir, subdir), exist_ok=True)
        
        # 内存缓存
        self.short_term_cache = OrderedDict()  # LRU缓存
        self.max_cache_size = 100
        self.cache_ttl = 300  # 5分钟
        
        # 用户偏好
        self.user_preferences = {}
        
        # 对话历史
        self.conversation_history = []
        self.max_history_length = 20
        
        # 统计
        self.stats = {
            'cache_hits': 0,
            'cache_misses': 0,
            'file_reads': 0,
            'file_writes': 0,
            'summary_calls': 0
        }
        
        print(f"✅ 简化记忆管理器初始化完成")
        print(f"   - 存储目录: {memory_dir}")
        print(f"   - 缓存大小: {self.max_cache_size} 条目")
        print(f"   - 缓存TTL: {self.cache_ttl} 秒")
    
    # ===== 短期记忆 (内存缓存) =====
    
    def store_short_term(self, key: str, data: Any, category: str = "default"):
        """
        存储短期记忆
        
        Args:
            key: 记忆键
            data: 数据
            category: 类别
        """
        cache_key = f"{category}:{key}"
        
        cache_entry = {
            'data': data,
            'timestamp': time.time(),
            'category': category,
            'expires_at': time.time() + self.cache_ttl
        }
        
        # 添加到缓存
        self.short_term_cache[cache_key] = cache_entry
        
        # 维护LRU大小
        if len(self.short_term_cache) > self.max_cache_size:
            oldest_key = next(iter(self.short_term_cache))
            del self.short_term_cache[oldest_key]
        
        # 同时存储到文件（可选）
        self._save_to_file('short_term', cache_key, cache_entry)
        
        self.stats['file_writes'] += 1
    
    def get_short_term(self, key: str, category: str = "default") -> Optional[Any]:
        """
        获取短期记忆
        
        Args:
            key: 记忆键
            category: 类别
            
        Returns:
            数据或None
        """
        cache_key = f"{category}:{key}"
        
        # 检查缓存
        if cache_key in self.short_term_cache:
            entry = self.short_term_cache[cache_key]
            
            # 检查是否过期
            if entry['expires_at'] > time.time():
                # 更新LRU位置
                self.short_term_cache.move_to_end(cache_key)
                self.stats['cache_hits'] += 1
                return entry['data']
            else:
                # 移除过期条目
                del self.short_term_cache[cache_key]
        
        # 尝试从文件加载
        file_data = self._load_from_file('short_term', cache_key)
        if file_data and file_data.get('expires_at', 0) > time.time():
            # 重新缓存
            self.short_term_cache[cache_key] = file_data
            self.short_term_cache.move_to_end(cache_key)
            self.stats['file_reads'] += 1
            return file_data['data']
        
        self.stats['cache_misses'] += 1
        return None
    
    def _clean_expired_cache(self):
        """清理过期缓存"""
        current_time = time.time()
        expired_keys = []
        
        for key, entry in self.short_term_cache.items():
            if entry['expires_at'] <= current_time:
                expired_keys.append(key)
        
        for key in expired_keys:
            del self.short_term_cache[key]
        
        if expired_keys:
            print(f"🧹 清理了 {len(expired_keys)} 个过期缓存条目")
    
    # ===== 中期记忆 (用户偏好和文档) =====
    
    def store_user_preference(self, user_id: str, preference: str, value: Any):
        """
        存储用户偏好
        
        Args:
            user_id: 用户ID
            preference: 偏好类型
            value: 偏好值
        """
        if user_id not in self.user_preferences:
            self.user_preferences[user_id] = {}
        
        self.user_preferences[user_id][preference] = {
            'value': value,
            'timestamp': datetime.now().isoformat(),
            'updated_at': time.time()
        }
        
        # 保存到文件
        pref_file = os.path.join(self.memory_dir, 'mid_term', f'user_{user_id}_prefs.json')
        with open(pref_file, 'w') as f:
            json.dump(self.user_preferences[user_id], f, indent=2)
        
        self.stats['file_writes'] += 1
        print(f"✅ 存储用户偏好: {user_id} -> {preference}: {value}")
    
    def get_user_preferences(self, user_id: str) -> Dict:
        """
        获取用户偏好
        
        Args:
            user_id: 用户ID
            
        Returns:
            用户偏好字典
        """
        # 检查内存
        if user_id in self.user_preferences:
            return self.user_preferences[user_id]
        
        # 从文件加载
        pref_file = os.path.join(self.memory_dir, 'mid_term', f'user_{user_id}_prefs.json')
        if os.path.exists(pref_file):
            try:
                with open(pref_file, 'r') as f:
                    prefs = json.load(f)
                self.user_preferences[user_id] = prefs
                self.stats['file_reads'] += 1
                return prefs
            except Exception as e:
                print(f"⚠️ 加载用户偏好失败: {e}")
        
        return {}
    
    def store_document(self, doc_id: str, text: str, metadata: Dict = None):
        """
        存储文档
        
        Args:
            doc_id: 文档ID
            text: 文档文本
            metadata: 元数据
        """
        doc_data = {
            'text': text,
            'metadata': metadata or {},
            'timestamp': datetime.now().isoformat(),
            'hash': hashlib.md5(text.encode()).hexdigest()[:8]
        }
        
        doc_file = os.path.join(self.memory_dir, 'mid_term', f'doc_{doc_id}.json')
        with open(doc_file, 'w') as f:
            json.dump(doc_data, f, indent=2, ensure_ascii=False)
        
        self.stats['file_writes'] += 1
    
    def search_documents(self, keyword: str, limit: int = 5) -> List[Dict]:
        """
        搜索文档（简单关键词搜索）
        
        Args:
            keyword: 关键词
            limit: 返回数量
            
        Returns:
            相关文档列表
        """
        keyword_lower = keyword.lower()
        results = []
        
        # 扫描文档文件
        doc_dir = os.path.join(self.memory_dir, 'mid_term')
        if not os.path.exists(doc_dir):
            return results
        
        for filename in os.listdir(doc_dir):
            if filename.startswith('doc_') and filename.endswith('.json'):
                try:
                    with open(os.path.join(doc_dir, filename), 'r') as f:
                        doc_data = json.load(f)
                    
                    # 简单关键词匹配
                    text = doc_data.get('text', '').lower()
                    metadata_str = json.dumps(doc_data.get('metadata', {})).lower()
                    
                    if keyword_lower in text or keyword_lower in metadata_str:
                        # 计算简单相关性分数
                        score = 0
                        if keyword_lower in text:
                            score += text.count(keyword_lower) * 10
                        if keyword_lower in metadata_str:
                            score += 5
                        
                        results.append({
                            **doc_data,
                            'filename': filename,
                            'score': score
                        })
                        
                        self.stats['file_reads'] += 1
                except Exception as e:
                    continue
        
        # 按分数排序
        results.sort(key=lambda x: x['score'], reverse=True)
        return results[:limit]
    
    # ===== 长期记忆 (配置和策略) =====
    
    def store_config(self, config_name: str, config_data: Dict):
        """
        存储配置
        
        Args:
            config_name: 配置名称
            config_data: 配置数据
        """
        config_file = os.path.join(self.memory_dir, 'long_term', f'config_{config_name}.json')
        
        full_config = {
            'data': config_data,
            'created_at': datetime.now().isoformat(),
            'updated_at': time.time()
        }
        
        with open(config_file, 'w') as f:
            json.dump(full_config, f, indent=2)
        
        self.stats['file_writes'] += 1
        print(f"✅ 存储配置: {config_name}")
    
    def load_config(self, config_name: str) -> Optional[Dict]:
        """
        加载配置
        
        Args:
            config_name: 配置名称
            
        Returns:
            配置数据或None
        """
        config_file = os.path.join(self.memory_dir, 'long_term', f'config_{config_name}.json')
        
        if not os.path.exists(config_file):
            return None
        
        try:
            with open(config_file, 'r') as f:
                config_data = json.load(f)
            self.stats['file_reads'] += 1
            return config_data.get('data')
        except Exception as e:
            print(f"⚠️ 加载配置失败: {e}")
            return None
    
    # ===== 对话管理 =====
    
    def add_conversation(self, role: str, content: str, conversation_id: str = "default"):
        """
        添加对话记录
        
        Args:
            role: 角色
            content: 内容
            conversation_id: 对话ID
        """
        message = {
            'role': role,
            'content': content,
            'timestamp': datetime.now().isoformat(),
            'conversation_id': conversation_id
        }
        
        self.conversation_history.append(message)
        
        # 限制历史长度
        if len(self.conversation_history) > self.max_history_length:
            self.conversation_history = self.conversation_history[-self.max_history_length:]
        
        # 定期保存到文件
        if len(self.conversation_history) % 5 == 0:
            self._save_conversation_history(conversation_id)
    
    def get_conversation_context(self, conversation_id: str = "default", limit: int = 10) -> List[Dict]:
        """
        获取对话上下文
        
        Args:
            conversation_id: 对话ID
            limit: 返回消息数量
            
        Returns:
            对话历史
        """
        # 过滤指定对话
        filtered = [msg for msg in self.conversation_history 
                   if msg['conversation_id'] == conversation_id]
        
        return filtered[-limit:]
    
    def _save_conversation_history(self, conversation_id: str = "default"):
        """保存对话历史到文件"""
        conv_file = os.path.join(self.memory_dir, 'conversations', f'conv_{conversation_id}.json')
        
        # 获取该对话的所有消息
        messages = [msg for msg in self.conversation_history 
                   if msg['conversation_id'] == conversation_id]
        
        if messages:
            conv_data = {
                'conversation_id': conversation_id,
                'messages': messages,
                'saved_at': datetime.now().isoformat(),
                'message_count': len(messages)
            }
            
            with open(conv_file, 'w') as f:
                json.dump(conv_data, f, indent=2, ensure_ascii=False)
            
            self.stats['file_writes'] += 1
    
    # ===== NeedleBot 专用方法 =====
    
    def store_market_snapshot(self, token: str, data: Dict):
        """
        存储市场快照
        
        Args:
            token: 代币符号
            data: 市场数据
        """
        snapshot_id = f"{token}_{int(time.time())}"
        self.store_short_term(snapshot_id, data, category="market_snapshot")
        
        # 同时存储为文档
        doc_text = f"{token} 市场快照: 价格={data.get('price')}, 24h变化={data.get('change24h')}%, 交易量={data.get('volume')}"
        self.store_document(f"market_{snapshot_id}", doc_text, {
            'token': token,
            'type': 'market_snapshot',
            **data
        })
    
    def store_trade_record(self, trade: Dict):
        """
        存储交易记录
        
        Args:
            trade: 交易数据
        """
        trade_id = trade.get('id', hashlib.md5(json.dumps(trade, sort_keys=True).encode()).hexdigest()[:8])
        
        # 存储到短期记忆
        self.store_short_term(f"trade_{trade_id}", trade, category="trades")
        
        # 存储到文档
        trade_text = f"交易 {trade_id}: {trade.get('action', 'unknown')} {trade.get('token')} @ {trade.get('price')}, 数量={trade.get('amount')}, 盈亏={trade.get('pnl')}"
        self.store_document(f"trade_{trade_id}", trade_text, trade)
        
        print(f"✅ 存储交易记录: {trade_id}")
    
    def find_similar_trades(self, current_trade: Dict, limit: int = 3) -> List[Dict]:
        """
        查找相似交易
        
        Args:
            current_trade: 当前交易
            limit: 返回数量
            
        Returns:
            相似交易列表
        """
        token = current_trade.get('token', '')
        action = current_trade.get('action', '')
        
        # 搜索相关文档
        query = f"{token} {action} trade"
        similar_docs = self.search_documents(query, limit * 2)
        
        # 提取交易数据
        similar_trades = []
        for doc in similar_docs:
            metadata = doc.get('metadata', {})
            if metadata.get('type') == 'trade' or 'trade_' in doc.get('filename', ''):
                similar_trades.append(metadata)
        
        return similar_trades[:limit]
    
    # ===== 工具方法 =====
    
    def _save_to_file(self, category: str, key: str, data: Dict):
        """保存数据到文件"""
        safe_key = key.replace(':', '_').replace('/', '_')
        file_path = os.path.join(self.memory_dir, category, f"{safe_key}.json")
        
        try:
            with open(file_path, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"⚠️ 保存文件失败 {file_path}: {e}")
    
    def _load_from_file(self, category: str, key: str) -> Optional[Dict]:
        """从文件加载数据"""
        safe_key = key.replace(':', '_').replace('/', '_')
        file_path = os.path.join(self.memory_dir, category, f"{safe_key}.json")
        
        if not os.path.exists(file_path):
            return None
        
        try:
            with open(file_path, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"⚠️ 加载文件失败 {file_path}: {e}")
            return None
    
    def get_stats(self) -> Dict:
        """
        获取统计信息
        
        Returns:
            统计字典
        """
        # 计算文件数量
        file_counts = {}
        for subdir in self.subdirs:
            dir_path = os.path.join(self.memory_dir, subdir)
            if os.path.exists(dir_path):
                file_counts[subdir] = len([f for f in os.listdir(dir_path) if f.endswith('.json')])
        
        return {
            **self.stats,
            'file_counts': file_counts,
            'cache_size': len(self.short_term_cache),
            'user_count': len(self.user_preferences),
            'conversation_count': len(self.conversation_history),
            'timestamp': datetime.now().isoformat()
        }
    
    def export_report(self, output_file: str = None):
        """
        导出报告
        
        Args:
            output_file: 输出文件路径
        """
        if not output_file:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            output_file = os.path.join(self.memory_dir, f'memory_report_{timestamp}.json')
        
        report = {
            'stats': self.get_stats(),
            'user_preferences': self.user_preferences,
            'recent_conversations': self.conversation_history[-10:],
            'cache_keys': list(self.short_term_cache.keys())[:10],
            'export_time': datetime.now().isoformat()
        }
        
        try:
            with open(output_file, 'w') as f:
                json.dump(report, f, indent=2, ensure_ascii=False)
            print(f"✅ 报告已导出到: {output_file}")
            return output_file
        except Exception as e:
            print(f"⚠️ 导出报告失败: {e}")
