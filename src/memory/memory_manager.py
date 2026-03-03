#!/usr/bin/env python3
"""
NeedleBot AI 分层记忆管理器
为 Solana Meme 币交易系统设计的专业记忆系统

架构：
1. 短期记忆 (Redis/内存) - 实时市场数据
2. 中期记忆 (Mem0/向量数据库) - 交易策略和用户偏好
3. 长期记忆 (文件系统) - 配置和静态知识
4. 滚动摘要 - 上下文优化
"""

import json
import time
import hashlib
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import os
import yaml

# 尝试导入可选依赖
try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    print("⚠️ Redis 不可用，短期记忆将使用内存存储")

try:
    from mem0 import Memory
    MEM0_AVAILABLE = True
except ImportError:
    MEM0_AVAILABLE = False
    print("⚠️ Mem0 不可用，用户画像功能将受限")

try:
    import chromadb
    from chromadb.config import Settings
    CHROMA_AVAILABLE = True
except ImportError:
    CHROMA_AVAILABLE = False
    print("⚠️ ChromaDB 不可用，文档记忆将使用文件存储")


class NeedleBotMemoryManager:
    """NeedleBot AI 分层记忆管理器"""
    
    def __init__(self, config_path: str = None):
        """
        初始化记忆管理器
        
        Args:
            config_path: 配置文件路径
        """
        self.config = self._load_config(config_path)
        self._init_components()
        
        # 记忆统计
        self.stats = {
            'short_term_hits': 0,
            'mid_term_hits': 0,
            'long_term_hits': 0,
            'summary_calls': 0
        }
        
        print(f"✅ NeedleBot 记忆管理器初始化完成")
        print(f"   - 短期记忆: {'Redis' if REDIS_AVAILABLE else '内存'}")
        print(f"   - 用户画像: {'Mem0' if MEM0_AVAILABLE else '禁用'}")
        print(f"   - 文档记忆: {'ChromaDB' if CHROMA_AVAILABLE else '文件'}")
    
    def _load_config(self, config_path: str) -> Dict:
        """加载配置文件"""
        default_config = {
            'memory': {
                'short_term': {
                    'ttl_minutes': 5,  # 5分钟短期记忆
                    'max_entries': 100
                },
                'mid_term': {
                    'collection_name': 'needlebot_history',
                    'max_results': 5
                },
                'rolling_summary': {
                    'max_messages': 10,
                    'summary_length': 200
                }
            },
            'projects': {
                'needlebot': {
                    'categories': ['market_data', 'signals', 'trades', 'analysis']
                }
            }
        }
        
        if config_path and os.path.exists(config_path):
            try:
                with open(config_path, 'r') as f:
                    user_config = yaml.safe_load(f) or {}
                # 合并配置
                default_config.update(user_config)
            except Exception as e:
                print(f"⚠️ 加载配置文件失败: {e}")
        
        return default_config
    
    def _init_components(self):
        """初始化各个记忆组件"""
        
        # 1. 短期记忆组件 (实时市场数据)
        self.short_term_memory = self._init_short_term_memory()
        
        # 2. 中期记忆组件 (用户画像和策略)
        self.mid_term_memory = self._init_mid_term_memory()
        
        # 3. 长期记忆组件 (配置和静态知识)
        self.long_term_memory = self._init_long_term_memory()
        
        # 4. 滚动摘要状态
        self.conversation_history = []
    
    def _init_short_term_memory(self):
        """初始化短期记忆 (Redis或内存)"""
        if REDIS_AVAILABLE and self.config.get('redis', {}).get('enabled', False):
            try:
                redis_config = self.config['redis']
                redis_client = redis.Redis(
                    host=redis_config.get('host', 'localhost'),
                    port=redis_config.get('port', 6379),
                    db=redis_config.get('db', 0),
                    decode_responses=True
                )
                redis_client.ping()  # 测试连接
                print("✅ 短期记忆: Redis 连接成功")
                return {'type': 'redis', 'client': redis_client}
            except Exception as e:
                print(f"⚠️ Redis 连接失败，回退到内存存储: {e}")
        
        # 内存存储
        print("✅ 短期记忆: 使用内存存储")
        return {'type': 'memory', 'data': {}, 'timestamps': {}}
    
    def _init_mid_term_memory(self):
        """初始化中期记忆 (Mem0 + ChromaDB)"""
        mid_term = {}
        
        # Mem0 用于用户画像
        if MEM0_AVAILABLE:
            try:
                mem0_config = self.config.get('mem0', {})
                mid_term['mem0'] = Memory(
                    api_key=mem0_config.get('api_key'),
                    endpoint=mem0_config.get('endpoint')
                )
                print("✅ 中期记忆: Mem0 初始化成功")
            except Exception as e:
                print(f"⚠️ Mem0 初始化失败: {e}")
                mid_term['mem0'] = None
        
        # ChromaDB 用于文档记忆
        if CHROMA_AVAILABLE:
            try:
                chroma_path = self.config.get('chroma', {}).get('path', './chroma_db')
                client = chromadb.PersistentClient(
                    path=chroma_path,
                    settings=Settings(anonymized_telemetry=False)
                )
                
                # 为每个项目类别创建集合
                collections = {}
                for project, proj_config in self.config.get('projects', {}).items():
                    for category in proj_config.get('categories', []):
                        collection_name = f"{project}_{category}"
                        collections[collection_name] = client.get_or_create_collection(
                            name=collection_name,
                            metadata={"project": project, "category": category}
                        )
                
                mid_term['chroma'] = {
                    'client': client,
                    'collections': collections
                }
                print(f"✅ 中期记忆: ChromaDB 初始化成功 ({len(collections)} 个集合)")
            except Exception as e:
                print(f"⚠️ ChromaDB 初始化失败: {e}")
                mid_term['chroma'] = None
        
        return mid_term
    
    def _init_long_term_memory(self):
        """初始化长期记忆 (文件系统)"""
        # 确保记忆目录存在
        memory_dir = self.config.get('memory_dir', './memory')
        os.makedirs(memory_dir, exist_ok=True)
        
        # 子目录
        subdirs = ['configs', 'strategies', 'analyses', 'logs']
        for subdir in subdirs:
            os.makedirs(os.path.join(memory_dir, subdir), exist_ok=True)
        
        print(f"✅ 长期记忆: 文件系统初始化完成 ({memory_dir})")
        return {'type': 'filesystem', 'base_dir': memory_dir}
    
    # ===== 短期记忆操作 =====
    
    def store_short_term(self, key: str, data: Any, category: str = 'market_data'):
        """
        存储短期记忆 (实时市场数据)
        
        Args:
            key: 记忆键 (如: "SOL_USD_5min")
            data: 数据
            category: 数据类别
        """
        ttl = self.config['memory']['short_term']['ttl_minutes'] * 60
        
        entry = {
            'data': data,
            'timestamp': time.time(),
            'category': category,
            'expires_at': time.time() + ttl
        }
        
        if self.short_term_memory['type'] == 'redis':
            try:
                self.short_term_memory['client'].setex(
                    f"needlebot:{category}:{key}",
                    ttl,
                    json.dumps(entry)
                )
            except Exception as e:
                print(f"⚠️ Redis 存储失败: {e}")
        else:
            # 内存存储
            self.short_term_memory['data'][key] = entry
            self.short_term_memory['timestamps'][key] = time.time()
            
            # 清理过期条目
            self._clean_expired_memory()
    
    def get_short_term(self, key: str, category: str = 'market_data') -> Optional[Any]:
        """
        获取短期记忆
        
        Args:
            key: 记忆键
            category: 数据类别
            
        Returns:
            数据或None
        """
        full_key = f"needlebot:{category}:{key}" if self.short_term_memory['type'] == 'redis' else key
        
        try:
            if self.short_term_memory['type'] == 'redis':
                data = self.short_term_memory['client'].get(full_key)
                if data:
                    entry = json.loads(data)
                    if entry['expires_at'] > time.time():
                        self.stats['short_term_hits'] += 1
                        return entry['data']
            else:
                # 内存存储
                if full_key in self.short_term_memory['data']:
                    entry = self.short_term_memory['data'][full_key]
                    if entry['expires_at'] > time.time():
                        self.stats['short_term_hits'] += 1
                        return entry['data']
        except Exception as e:
            print(f"⚠️ 获取短期记忆失败: {e}")
        
        return None
    
    def _clean_expired_memory(self):
        """清理过期的内存条目"""
        current_time = time.time()
        expired_keys = []
        
        for key, entry in self.short_term_memory['data'].items():
            if entry['expires_at'] <= current_time:
                expired_keys.append(key)
        
        for key in expired_keys:
            del self.short_term_memory['data'][key]
            del self.short_term_memory['timestamps'][key]
        
        if expired_keys:
            print(f"🧹 清理了 {len(expired_keys)} 个过期短期记忆条目")
    
    # ===== 中期记忆操作 =====
    
    def store_user_preference(self, user_id: str, preference: str, value: Any):
        """
        存储用户偏好到 Mem0
        
        Args:
            user_id: 用户ID
            preference: 偏好类型 (如: "preferred_chain", "trading_style")
            value: 偏好值
        """
        if not MEM0_AVAILABLE or 'mem0' not in self.mid_term_memory or not self.mid_term_memory['mem0']:
            return
        
        try:
            text = f"用户偏好: {preference} = {value}"
            self.mid_term_memory['mem0'].add(text, user_id=user_id)
            print(f"✅ 存储用户偏好: {user_id} -> {preference}: {value}")
        except Exception as e:
            print(f"⚠️ 存储用户偏好失败: {e}")
    
    def get_user_context(self, user_id: str, query: str = None) -> str:
        """
        获取用户上下文 (用户画像)
        
        Args:
            user_id: 用户ID
            query: 查询文本
            
        Returns:
            上下文字符串
        """
        if not MEM0_AVAILABLE or 'mem0' not in self.mid_term_memory or not self.mid_term_memory['mem0']:
            return ""
        
        try:
            memories = self.mid_term_memory['mem0'].search(
                query or "用户偏好",
                user_id=user_id,
                limit=3
            )
            
            if memories:
                self.stats['mid_term_hits'] += 1
                context_lines = [f"📝 用户画像 ({user_id}):"]
                for i, mem in enumerate(memories[:3], 1):
                    context_lines.append(f"  {i}. {mem.get('text', '')}")
                return "\n".join(context_lines)
        except Exception as e:
            print(f"⚠️ 获取用户上下文失败: {e}")
        
        return ""
    
    def store_document(self, project: str, category: str, doc_id: str, text: str, metadata: Dict = None):
        """
        存储文档到向量数据库
        
        Args:
            project: 项目名称 (如: "needlebot")
            category: 类别 (如: "market_analysis")
            doc_id: 文档ID
            text: 文档文本
            metadata: 元数据
        """
        if not CHROMA_AVAILABLE or 'chroma' not in self.mid_term_memory or not self.mid_term_memory['chroma']:
            return
        
        collection_name = f"{project}_{category}"
        if collection_name not in self.mid_term_memory['chroma']['collections']:
            print(f"⚠️ 集合不存在: {collection_name}")
            return
        
        try:
            collection = self.mid_term_memory['chroma']['collections'][collection_name]
            
            # 构建完整元数据
            full_metadata = {
                'project': project,
                'category': category,
                'timestamp': datetime.now().isoformat(),
                'source': 'needlebot_ai'
            }
            if metadata:
                full_metadata.update(metadata)
            
            collection.add(
                documents=[text],
                metadatas=[full_metadata],
                ids=[doc_id]
            )
            
            print(f"✅ 存储文档: {collection_name} -> {doc_id}")
        except Exception as e:
            print(f"⚠️ 存储文档失败: {e}")
    
    def query_documents(self, project: str, category: str, query: str, n_results: int = 3) -> List[Dict]:
        """
        查询相关文档
        
        Args:
            project: 项目名称
            category: 类别
            query: 查询文本
            n_results: 返回结果数量
            
        Returns:
            相关文档列表
        """
        if not CHROMA_AVAILABLE or 'chroma' not in self.mid_term_memory or not self.mid_term_memory['chroma']:
            return []
        
        collection_name = f"{project}_{category}"
        if collection_name not in self.mid_term_memory['chroma']['collections']:
            return []
        
        try:
            collection = self.mid_term_memory['chroma']['collections'][collection_name]
            results = collection.query(
                query_texts=[query],
                n_results=min(n_results, 10)
            )
            
            if results and results['documents']:
                self.stats['mid_term_hits'] += 1
                documents = []
                for i, (doc, metadata) in enumerate(zip(results['documents'][0], results['metadatas'][0])):
                    documents.append({
                        'text': doc,
                        'metadata': metadata,
                        'score': results['distances'][0][i] if results.get('distances') else None
                    })
                return documents
        except Exception as e:
            print(f"⚠️ 查询文档失败: {e}")
        
        return []
    
    # ===== 长期记忆操作 =====
    
    def store_config(self, config_name: str, config_data: Dict):
        """
        存储配置到文件系统
        
        Args:
            config_name: 配置名称
            config_data: 配置数据
        """
        config_path = os.path.join(self.long_term_memory['base_dir'], 'configs', f"{config_name}.yaml")
        
        try:
            with open(config_path, 'w') as f:
                yaml.dump(config_data, f, default_flow_style=False)
            print(f"✅ 存储配置: {config_name}")
        except Exception as e:
            print(f"⚠️ 存储配置失败: {e}")
    
    def load_config(self, config_name: str) -> Optional[Dict]:
        """
        加载配置
        
        Args:
            config_name: 配置名称
            
        Returns:
            配置数据或None
        """
        config_path = os.path.join(self.long_term_memory['base_dir'], 'configs', f"{config_name}.yaml")
        
        if not os.path.exists(config_path):
            return None
        
        try:
            with open(config_path, 'r') as f:
                config_data = yaml.safe_load(f)
            self.stats['long_term_hits'] += 1
            return config_data
        except Exception as e:
            print(f"⚠️ 加载配置失败: {e}")
            return None
    
    def store_strategy_analysis(self, strategy_id: str, analysis: Dict):
        """
        存储策略分析
        
        Args:
            strategy_id: 策略ID
            analysis: 分析数据
        """
        analysis_path = os.path.join(self.long_term_memory['base_dir'], 'strategies', f"{strategy_id}.json")
        
        try:
            with open(analysis_path, 'w') as f:
                json.dump(analysis, f, indent=2)
            print(f"✅ 存储策略分析: {strategy_id}")
        except Exception as e:
            print(f"⚠️ 存储策略分析失败: {e}")
    
    def load_strategy_analysis(self, strategy_id: str) -> Optional[Dict]:
        """
        加载策略分析
        
        Args:
            strategy_id: 策略ID
            
        Returns:
            分析数据或None
        """
        analysis_path = os.path.join(self.long_term_memory['base_dir'], 'strategies', f"{strategy_id}.json")
        
        if not os.path.exists(analysis_path):
            return None
        
        try:
            with open(analysis_path, 'r') as f:
                analysis = json.load(f)
            self.stats['long_term_hits'] += 1
            return analysis
        except Exception as e:
            print(f"⚠️ 加载策略分析失败: {e}")
            return None
    
    # ===== 滚动摘要操作 =====
    
    def add_conversation_message(self, role: str, content: str):
        """
        添加对话消息
        
        Args:
            role: 角色 (user/assistant/system)
            content: 内容
        """
        message = {
            'role': role,
            'content': content,
            'timestamp': time.time()
        }
        self.conversation_history.append(message)
        
        # 检查是否需要摘要
        if len(self.conversation_history) > self.config['memory']['rolling_summary']['max_messages']:
            self._create_summary()
    
    def _create_summary(self):
        """创建对话摘要"""
        try:
            # 获取需要摘要的消息（除了最后2条）
            messages_to_summarize = self.conversation_history[:-2]
            
            if len(messages_to_summarize) < 3:
                return
            
            # 构建摘要提示
            summary_prompt = self._build_summary_prompt(messages_to_summarize)
            
            # 这里应该调用一个轻量级模型 (如 Gemini Flash)
            # 为了示例，我们使用简单的规则摘要
            summary = self._simple_summary(messages_to_summarize)
            
            # 替换历史记录
            self.conversation_history = [
                {'role': 'system', 'content': f"对话摘要: {summary}", 'timestamp': time.time()}
            ] + self.conversation_history[-2:]
            
            self.stats['summary_calls'] += 1
            print(f"✅ 创建对话摘要: {len(summary)} 字符")
            
        except Exception as e:
            print(f"⚠️ 创建摘要失败: {e}")
    
    def _build_summary_prompt(self, messages: List[Dict]) -> str:
        """构建摘要提示"""
        conversation_text = "\n".join([
            f"{msg['role']}: {msg['content'][:100]}..." if len(msg['content']) > 100 else f"{msg['role']}: {msg['content']}"
            for msg in messages
        ])
        
        return f"""请将以下对话总结为不超过{self.config['memory']['rolling_summary']['summary_length']}字的摘要，保留核心信息和决策：

{conversation_text}

摘要:"""
    
    def _simple_summary(self, messages: List[Dict]) -> str:
        """简单的规则摘要（在没有模型的情况下使用）"""
        # 提取关键信息
        user_messages = [m for m in messages if m['role'] == 'user']
        assistant_messages = [m for m in messages if m['role'] == 'assistant']
        
        topics = set()
        decisions = []
        
        for msg in messages:
            content = msg['content'].lower()
            # 简单关键词提取
            if any(word in content for word in ['buy', 'sell', 'trade', 'position']):
                decisions.append('交易决策')
            if any(word in content for word in ['solana', 'meme', 'token']):
                topics.add('Solana Meme币')
            if any(word in content for word in ['risk', 'stop loss', 'position size']):
                topics.add('风险管理')
        
        topics_list = list(topics)[:3]
        summary = f"讨论了{', '.join(topics_list)}。"
        if decisions:
            summary += f" 涉及{len(decisions)}个交易决策。"
        
        return summary[:self.config['memory']['rolling_summary']['summary_length']]
    
    def get_conversation_context(self) -> List[Dict]:
        """
        获取对话上下文（已应用摘要）
        
        Returns:
            对话历史
        """
        return self.conversation_history.copy()
    
    # ===== NeedleBot 专用方法 =====
    
    def store_market_data(self, token: str, timeframe: str, data: Dict):
        """
        存储市场数据（NeedleBot专用）
        
        Args:
            token: 代币符号 (如: "BONK")
            timeframe: 时间框架 (如: "5min")
            data: 市场数据
        """
        key = f"{token}_{timeframe}_{int(time.time())}"
        self.store_short_term(key, data, category='market_data')
        
        # 同时存储到中期记忆供分析
        analysis_text = f"{token} {timeframe} 数据: 价格={data.get('price')}, 变化={data.get('change24h')}%"
        doc_id = f"market_{token}_{timeframe}_{datetime.now().strftime('%Y%m%d_%H%M')}"
        self.store_document('needlebot', 'market_analysis', doc_id, analysis_text, {
            'token': token,
            'timeframe': timeframe,
            'price': data.get('price'),
            'change': data.get('change24h')
        })
    
    def store_trade_signal(self, signal: Dict):
        """
        存储交易信号（NeedleBot专用）
        
        Args:
            signal: 信号数据
        """
        signal_id = signal.get('id', hashlib.md5(json.dumps(signal, sort_keys=True).encode()).hexdigest()[:8])
        
        # 存储到短期记忆
        self.store_short_term(f"signal_{signal_id}", signal, category='signals')
        
        # 存储到中期记忆
        signal_text = f"交易信号: {signal.get('token')} 跌幅{signal.get('drop_percent')}% 回升{signal.get('recovery_percent')}% 置信度{signal.get('confidence')}"
        self.store_document('needlebot', 'signals', f"signal_{signal_id}", signal_text, signal)
        
        # 存储到长期记忆（策略分析）
        if signal.get('executed'):
            analysis = {
                'signal': signal,
                'timestamp': datetime.now().isoformat(),
                'outcome': signal.get('outcome', 'pending')
            }
            self.store_strategy_analysis(f"trade_{signal_id}", analysis)
    
    def query_similar_signals(self, current_signal: Dict, n_results: int = 3) -> List[Dict]:
        """
        查询相似的历史信号（NeedleBot专用）
        
        Args:
            current_signal: 当前信号
            n_results: 返回结果数量
            
        Returns:
            相似信号列表
        """
        query_text = f"{current_signal.get('token')} 插针信号 跌幅{current_signal.get('drop_percent', 0)}%"
        
        similar_docs = self.query_documents('needlebot', 'signals', query_text, n_results)
        
        similar_signals = []
        for doc in similar_docs:
            if 'metadata' in doc:
                similar_signals.append(doc['metadata'])
        
        return similar_signals
    
    # ===== 工具方法 =====
    
    def get_stats(self) -> Dict:
        """
        获取记忆统计
        
        Returns:
            统计信息
        """
        return {
            **self.stats,
            'conversation_length': len(self.conversation_history),
            'short_term_size': len(self.short_term_memory.get('data', {})) if self.short_term_memory['type'] == 'memory' else 'unknown',
            'timestamp': datetime.now().isoformat()
        }
    
    def export_memory_dump(self, output_path: str = None):
        """
        导出记忆转储
        
        Args:
            output_path: 输出路径
        """
        if not output_path:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            output_path = os.path.join(self.long_term_memory['base_dir'], 'logs', f'memory_dump_{timestamp}.json')
        
        dump_data = {
            'stats': self.get_stats(),
            'config': self.config,
            'conversation_history': self.conversation_history[-10:],  # 最后10条消息
            'short_term_samples': list(self.short_term_memory.get('data', {}).keys())[:5] if self.short_term_memory['type'] == 'memory' else [],
            'export_timestamp': datetime.now().isoformat()
        }
        
        try:
            with open(output_path, 'w') as f:
                json.dump(dump_data, f, indent=2, ensure_ascii=False)
            print(f"✅ 记忆转储已导出到: {output_path}")
            return output_path
        except Exception as e:
            print(f"⚠️ 导出记忆转储失败: {e}")
            return None
    
    def cleanup(self):
        """清理资源"""
        print("🧹 清理记忆管理器资源...")
        
        # 导出统计
        self.export_memory_dump()
        
        # 打印最终统计
        stats = self.get_stats()
        print(f"📊 最终统计:")
        print(f"  - 短期记忆命中: {stats['short_term_hits']}")
        print(f"  - 中期记忆命中: {stats['mid_term_hits']}")
        print(f"  - 长期记忆命中: {stats['long_term_hits']}")
        print(f"  - 摘要调用次数: {stats['summary_calls']}")
        print(f"  - 当前对话长度: {stats['conversation_length']}")


# ===== 使用示例 =====
def example_usage():
    """使用示例"""
    
    # 1. 初始化记忆管理器
    print("1. 初始化 NeedleBot 记忆管理器")
    memory_manager = NeedleBotMemoryManager()
    
    # 2. 存储用户偏好
    print("\n2. 存储用户偏好")
    memory_manager.store_user_preference("user123", "preferred_chain", "Solana")
    memory_manager.store_user_preference("user123", "trading_style", "aggressive")
    
    # 3. 存储市场数据
    print("\n3. 存储市场数据")
    market_data = {
        'token': 'BONK',
        'price': 0.000012,
        'change24h': -2.5,
        'volume': 150000,
        'liquidity': 50000
    }
    memory_manager.store_market_data('BONK', '5min', market_data)
    
    # 4. 存储交易信号
    print("\n4. 存储交易信号")
    signal = {
        'id': 'sig_001',
        'token': 'WIF',
        'drop_percent': 25.3,
        'recovery_percent': 52.1,
        'confidence': 85,
        'timestamp': datetime.now().isoformat(),
        'executed': True,
        'outcome': 'profit'
    }
    memory_manager.store_trade_signal(signal)
    
    # 5. 查询相似信号
    print("\n5. 查询相似信号")
    current_signal = {'token': 'WIF', 'drop_percent': 22.1}
    similar = memory_manager.query_similar_signals(current_signal, 2)
    print(f"找到 {len(similar)} 个相似信号")
    
    # 6. 添加对话
    print("\n6. 模拟对话")
    memory_manager.add_conversation_message('user', '请分析一下 BONK 的当前走势')
    memory_manager.add_conversation_message('assistant', 'BONK 当前价格 0.000012，24小时下跌 2.5%，建议观望')
    memory_manager.add_conversation_message('user', '那 WIF 呢？有没有插针机会？')
    
    # 7. 获取用户上下文
    print("\n7. 获取用户上下文")
    context = memory_manager.get_user_context("user123", "交易偏好")
    print(f"用户上下文: {context[:100]}...")
    
    # 8. 获取统计
    print("\n8. 记忆统计")
    stats = memory_manager.get_stats()
    for key, value in stats.items():
        print(f"  {key}: {value}")
    
    # 9. 清理
    print("\n9. 清理资源")
    memory_manager.cleanup()
    
    return memory_manager


if __name__ == "__main__":
    print("=" * 60)
    print("NeedleBot 分层记忆管理器 - 示例运行")
    print("=" * 60)
    
    mm = example_usage()
    
    print("\n" + "=" * 60)
    print("✅ 示例运行完成")
    print("=" * 60)