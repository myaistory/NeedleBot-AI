#!/usr/bin/env python3
"""
NeedleBot 记忆系统使用示例
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'src'))

from memory.simple_memory_manager import SimpleMemoryManager


def run_needlebot_memory_example():
    """运行 NeedleBot 记忆示例"""
    
    print("=" * 60)
    print("NeedleBot AI 记忆系统示例")
    print("=" * 60)
    
    # 1. 初始化记忆管理器
    print("\n1. 🚀 初始化记忆管理器")
    memory = SimpleMemoryManager(memory_dir="./test_memory")
    
    # 2. 存储用户偏好
    print("\n2. 👤 存储用户偏好")
    memory.store_user_preference("trader_alice", "preferred_chain", "Solana")
    memory.store_user_preference("trader_alice", "risk_tolerance", "medium")
    memory.store_user_preference("trader_alice", "favorite_tokens", ["BONK", "WIF", "POPCAT"])
    
    # 3. 存储市场数据
    print("\n3. 📊 存储市场数据")
    
    # BONK 市场快照
    bonk_data = {
        "token": "BONK",
        "price": 0.0000125,
        "change24h": -2.3,
        "volume": 142000,
        "liquidity": 52000,
        "timestamp": "2026-02-24T14:30:00Z"
    }
    memory.store_market_snapshot("BONK", bonk_data)
    
    # WIF 市场快照
    wif_data = {
        "token": "WIF",
        "price": 0.2015,
        "change24h": -1.8,
        "volume": 245000,
        "liquidity": 89000,
        "timestamp": "2026-02-24T14:30:00Z"
    }
    memory.store_market_snapshot("WIF", wif_data)
    
    # 4. 模拟交易记录
    print("\n4. 💰 存储交易记录")
    
    # 成功交易
    successful_trade = {
        "id": "trade_001",
        "token": "BONK",
        "action": "buy",
        "price": 0.0000118,
        "amount": 1000000,
        "entry_time": "2026-02-24T14:15:00Z",
        "exit_time": "2026-02-24T14:25:00Z",
        "exit_price": 0.0000125,
        "pnl": 0.18,  # 18%
        "pnl_percent": 18.0,
        "strategy": "needle_recovery"
    }
    memory.store_trade_record(successful_trade)
    
    # 失败交易
    failed_trade = {
        "id": "trade_002",
        "token": "WIF",
        "action": "buy",
        "price": 0.2050,
        "amount": 500,
        "entry_time": "2026-02-24T13:45:00Z",
        "exit_time": "2026-02-24T14:10:00Z",
        "exit_price": 0.1980,
        "pnl": -0.035,  # -3.5%
        "pnl_percent": -3.5,
        "strategy": "breakout_failed"
    }
    memory.store_trade_record(failed_trade)
    
    # 5. 模拟对话
    print("\n5. 💬 模拟交易对话")
    
    memory.add_conversation("user", "trader_alice", "请分析 BONK 的当前走势")
    memory.add_conversation("assistant", "needlebot", "BONK 当前价格 0.0000125，24小时下跌 2.3%，交易量 142k。建议关注 0.000011 支撑位。")
    
    memory.add_conversation("user", "trader_alice", "刚才的插针信号怎么样？")
    memory.add_conversation("assistant", "needlebot", "检测到 BONK 在 14:15 出现 22% 插针，已快速回升 48%。符合交易策略，建议小仓位尝试。")
    
    memory.add_conversation("user", "trader_alice", "执行交易，买入 1000000 BONK @ 0.0000118")
    memory.add_conversation("assistant", "needlebot", "交易执行成功。设置止损 0.0000112，止盈 0.0000130。")
    
    # 6. 查询和检索
    print("\n6. 🔍 记忆查询测试")
    
    # 查询用户偏好
    print("\n  用户偏好查询:")
    alice_prefs = memory.get_user_preferences("trader_alice")
    for key, value in alice_prefs.items():
        print(f"    {key}: {value.get('value')}")
    
    # 搜索相似交易
    print("\n  相似交易搜索:")
    current_signal = {"token": "BONK", "action": "buy", "price": 0.0000120}
    similar_trades = memory.find_similar_trades(current_signal, 2)
    print(f"    找到 {len(similar_trades)} 个相似交易")
    for trade in similar_trades:
        print(f"    - {trade.get('token')} {trade.get('action')} @ {trade.get('price')}, 盈亏: {trade.get('pnl_percent')}%")
    
    # 搜索市场文档
    print("\n  市场文档搜索:")
    market_docs = memory.search_documents("BONK market", 2)
    print(f"    找到 {len(market_docs)} 个相关文档")
    for doc in market_docs:
        print(f"    - {doc.get('text', '')[:60]}...")
    
    # 7. 获取对话上下文
    print("\n7. 📝 对话上下文")
    conversation = memory.get_conversation_context("default", 5)
    print(f"    最近 {len(conversation)} 条消息:")
    for msg in conversation:
        print(f"    [{msg.get('role')}] {msg.get('content', '')[:50]}...")
    
    # 8. 统计和报告
    print("\n8. 📊 记忆系统统计")
    stats = memory.get_stats()
    for key, value in stats.items():
        if key != 'file_counts':
            print(f"    {key}: {value}")
    
    print("\n  文件统计:")
    file_counts = stats.get('file_counts', {})
    for category, count in file_counts.items():
        print(f"    {category}: {count} 个文件")
    
    # 9. 导出报告
    print("\n9. 📁 导出记忆报告")
    report_file = memory.export_report()
    print(f"    报告已保存到: {report_file}")
    
    # 10. 清理过期缓存
    print("\n10. 🧹 清理过期缓存")
    # 这里可以调用 memory._clean_expired_cache() 如果需要
    
    print("\n" + "=" * 60)
    print("✅ NeedleBot 记忆示例运行完成")
    print("=" * 60)
    
    return memory


def test_memory_performance():
    """测试记忆系统性能"""
    print("\n" + "=" * 60)
    print("🧪 记忆系统性能测试")
    print("=" * 60)
    
    memory = SimpleMemoryManager(memory_dir="./test_memory_perf")
    
    import time
    
    # 测试写入性能
    print("\n写入性能测试...")
    start_time = time.time()
    
    for i in range(100):
        memory.store_short_term(f"test_key_{i}", {"value": i, "data": "x" * 100})
    
    write_time = time.time() - start_time
    print(f"  写入 100 条记录: {write_time:.3f} 秒 ({100/write_time:.1f} 条/秒)")
    
    # 测试读取性能
    print("\n读取性能测试...")
    start_time = time.time()
    
    hits = 0
    for i in range(100):
        if memory.get_short_term(f"test_key_{i}"):
            hits += 1
    
    read_time = time.time() - start_time
    hit_rate = hits / 100 * 100
    print(f"  读取 100 条记录: {read_time:.3f} 秒 ({100/read_time:.1f} 条/秒)")
    print(f"  命中率: {hit_rate:.1f}%")
    
    # 最终统计
    stats = memory.get_stats()
    print(f"\n最终统计:")
    print(f"  缓存命中: {stats.get('cache_hits', 0)}")
    print(f"  缓存未命中: {stats.get('cache_misses', 0)}")
    print(f"  文件读取: {stats.get('file_reads', 0)}")
    print(f"  文件写入: {stats.get('file_writes', 0)}")


if __name__ == "__main__":
    # 运行主示例
    mm = run_needlebot_memory_example()
    
    # 可选：运行性能测试
    # test_memory_performance()
    
    print("\n🎯 下一步建议:")
    print("1. 将 SimpleMemoryManager 集成到 NeedleBot 主程序中")
    print("2. 在 PriceFetcher 中存储市场数据")
    print("3. 在 NeedleDetector 中存储信号和交易记录")
    print("4. 在 RiskManager 中查询历史交易进行风险分析")
    print("5. 定期导出记忆报告进行策略优化")