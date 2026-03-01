#!/usr/bin/env node
/**
 * 简单记忆系统测试
 */

const MemoryIntegration = require('./src/memory/memory-integration');

async function testMemorySystem() {
    console.log('🧪 简单记忆系统测试');
    console.log('='.repeat(60));
    
    try {
        // 1. 创建记忆系统实例
        console.log('\n1. 创建记忆系统实例...');
        const memory = new MemoryIntegration({
            memoryDir: './test_memory_simple',
            userId: 'test_user',
            enableShortTerm: true,
            enableUserProfiles: true,
            enableDocumentMemory: true
        });
        
        // 2. 初始化记忆系统
        console.log('\n2. 初始化记忆系统...');
        const initialized = await memory.initialize();
        console.log(`  初始化结果: ${initialized ? '成功' : '失败'}`);
        
        if (!initialized) {
            console.log('❌ 记忆系统初始化失败');
            return false;
        }
        
        // 3. 存储用户偏好
        console.log('\n3. 存储用户偏好...');
        await memory.updateUserPreference('preferred_chain', 'Solana');
        await memory.updateUserPreference('risk_tolerance', 'medium');
        await memory.updateUserPreference('trading_style', 'needle_recovery');
        
        // 4. 存储市场数据
        console.log('\n4. 存储市场数据...');
        const marketData = {
            token: 'BONK',
            price: 0.0000125,
            change24h: -2.3,
            volume: 142000,
            timestamp: new Date().toISOString()
        };
        await memory.storeMarketData('BONK', marketData);
        
        // 5. 存储交易信号
        console.log('\n5. 存储交易信号...');
        const signal = {
            token: 'BONK',
            confidence: 85,
            drop_percent: 22.5,
            recovery_percent: 52.1,
            timestamp: new Date().toISOString()
        };
        await memory.storeSignal(signal);
        
        // 6. 存储交易记录
        console.log('\n6. 存储交易记录...');
        const trade = {
            token: 'BONK',
            action: 'buy',
            entry_price: 0.0000118,
            amount: 0.1,
            pnl: 0.018,
            pnl_percent: 18.0,
            timestamp: new Date().toISOString()
        };
        await memory.storeTrade(trade);
        
        // 7. 查询相似交易
        console.log('\n7. 查询相似交易...');
        const similarTrades = await memory.findSimilarTrades({ token: 'BONK' }, 3);
        console.log(`  找到相似交易: ${similarTrades.length} 个`);
        
        // 8. 获取统计
        console.log('\n8. 获取记忆统计...');
        const stats = memory.getStats();
        console.log('  统计信息:');
        for (const [key, value] of Object.entries(stats)) {
            if (typeof value !== 'object' || value === null) {
                console.log(`    ${key}: ${value}`);
            }
        }
        
        // 9. 导出报告
        console.log('\n9. 导出记忆报告...');
        const reportFile = await memory.exportReport();
        console.log(`  报告文件: ${reportFile || '无'}`);
        
        // 10. 清理资源
        console.log('\n10. 清理记忆系统资源...');
        await memory.cleanup();
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ 简单记忆系统测试完成');
        console.log('='.repeat(60));
        
        return true;
        
    } catch (error) {
        console.error('\n❌ 测试失败:', error);
        console.error('错误堆栈:', error.stack);
        return false;
    }
}

// 运行测试
if (require.main === module) {
    testMemorySystem()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('测试执行失败:', error);
            process.exit(1);
        });
}