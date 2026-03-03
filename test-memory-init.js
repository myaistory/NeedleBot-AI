#!/usr/bin/env node
/**
 * 测试 NeedleBot 记忆系统初始化
 */

require('dotenv').config();
const NeedleBotAI = require('./src/index');

async function testMemoryInit() {
    console.log('🧪 测试 NeedleBot 记忆系统初始化');
    console.log('='.repeat(60));
    
    try {
        // 1. 创建 NeedleBot 实例
        console.log('\n1. 创建 NeedleBot AI 实例...');
        const bot = new NeedleBotAI({
            scanIntervalMs: 10000,
            tradingEnabled: false, // 禁用交易，只测试初始化
            initialBalanceSOL: 1.0,
            maxPositionSizeSOL: 0.1
        });
        
        console.log('  记忆系统实例:', bot.memorySystem ? '存在' : '不存在');
        
        // 2. 直接调用初始化方法
        console.log('\n2. 直接初始化记忆系统...');
        await bot.initializeMemorySystem();
        
        // 3. 检查记忆系统状态
        console.log('\n3. 检查记忆系统状态...');
        if (bot.memorySystem) {
            const stats = bot.memorySystem.getStats();
            console.log('  记忆系统统计:');
            console.log('    是否初始化:', stats.isInitialized);
            console.log('    记忆类型:', stats.memoryType);
            console.log('    用户ID:', stats.userId);
            console.log('    错误数:', stats.errors);
            
            // 检查用户偏好
            console.log('  用户偏好数量:', Object.keys(bot.userPreferences).length);
            if (Object.keys(bot.userPreferences).length > 0) {
                console.log('  用户偏好示例:');
                for (const [key, value] of Object.entries(bot.userPreferences)) {
                    console.log(`    ${key}:`, typeof value === 'object' ? JSON.stringify(value) : value);
                    if (Object.keys(bot.userPreferences).length > 3) {
                        console.log('    ... (更多偏好)');
                        break;
                    }
                }
            }
        }
        
        // 4. 清理
        console.log('\n4. 清理资源...');
        if (bot.memorySystem) {
            await bot.memorySystem.cleanup();
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ 记忆系统初始化测试完成');
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
    testMemoryInit()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('测试执行失败:', error);
            process.exit(1);
        });
}