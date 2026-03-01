#!/usr/bin/env node
/**
 * 测试 NeedleBot 构造函数
 */

require('dotenv').config();
const NeedleBotAI = require('./src/index');

async function testConstructor() {
    console.log('🧪 测试 NeedleBot 构造函数');
    console.log('='.repeat(60));
    
    try {
        // 1. 创建 NeedleBot 实例
        console.log('\n1. 创建 NeedleBot AI 实例...');
        const bot = new NeedleBotAI({
            scanIntervalMs: 10000,
            tradingEnabled: false,
            initialBalanceSOL: 1.0,
            maxPositionSizeSOL: 0.1
        });
        
        console.log('  bot 实例创建成功:', typeof bot);
        console.log('  memorySystem:', bot.memorySystem ? '存在' : 'null/undefined');
        
        if (bot.memorySystem) {
            console.log('  memorySystem 类型:', typeof bot.memorySystem);
            console.log('  memorySystem 构造函数:', bot.memorySystem.constructor.name);
            
            // 检查方法
            const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(bot.memorySystem))
                .filter(name => name !== 'constructor' && typeof bot.memorySystem[name] === 'function');
            console.log('  memorySystem 方法:', methods.slice(0, 10));
        }
        
        // 2. 检查其他组件
        console.log('\n2. 检查其他组件...');
        console.log('  priceFetcher:', bot.priceFetcher ? '存在' : 'null');
        console.log('  detector:', bot.detector ? '存在' : 'null');
        console.log('  riskManager:', bot.riskManager ? '存在' : 'null');
        console.log('  trading:', bot.trading ? '存在' : 'null');
        
        // 3. 检查配置
        console.log('\n3. 检查配置...');
        console.log('  scanIntervalMs:', bot.config.scanIntervalMs);
        console.log('  tradingEnabled:', bot.config.tradingEnabled);
        console.log('  initialBalanceSOL:', bot.config.initialBalanceSOL);
        console.log('  maxPositionSizeSOL:', bot.config.maxPositionSizeSOL);
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ 构造函数测试完成');
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
    testConstructor()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('测试执行失败:', error);
            process.exit(1);
        });
}