#!/usr/bin/env node
/**
 * 简单测试 NeedleBot 启动
 */

require('dotenv').config();
const NeedleBotAI = require('./src/index');

async function testSimpleStart() {
    console.log('🧪 简单测试 NeedleBot 启动');
    console.log('='.repeat(60));
    
    try {
        // 1. 创建 NeedleBot 实例
        console.log('\n1. 创建 NeedleBot AI 实例...');
        const bot = new NeedleBotAI({
            scanIntervalMs: 5000, // 5秒
            tradingEnabled: false,
            initialBalanceSOL: 1.0,
            maxPositionSizeSOL: 0.1
        });
        
        console.log('  bot 创建成功');
        console.log('  memorySystem 在构造函数后:', bot.memorySystem ? '存在' : 'null');
        
        // 2. 启动系统（会初始化记忆系统）
        console.log('\n2. 启动系统...');
        await bot.start();
        
        // 3. 等待一会儿
        console.log('\n3. 等待 3 秒...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 4. 停止系统
        console.log('\n4. 停止系统...');
        bot.stop();
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ 简单启动测试完成');
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
    testSimpleStart()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('测试执行失败:', error);
            process.exit(1);
        });
}