#!/usr/bin/env node
/**
 * NeedleBot 记忆系统集成测试
 */

require('dotenv').config();
const NeedleBotAI = require('./src/index');
const logger = require('./src/utils/logger');

async function testMemoryIntegration() {
    console.log('🧪 测试 NeedleBot 记忆系统集成');
    console.log('='.repeat(60));
    
    try {
        // 1. 创建 NeedleBot 实例
        console.log('\n1. 创建 NeedleBot AI 实例...');
        const bot = new NeedleBotAI({
            scanIntervalMs: 10000, // 10秒扫描间隔
            tradingEnabled: true,
            initialBalanceSOL: 1.0,
            maxPositionSizeSOL: 0.1
        });
        
        // 2. 启动系统（会初始化记忆系统）
        console.log('\n2. 启动系统（包含记忆系统初始化）...');
        await bot.start();
        
        // 3. 显示初始状态
        console.log('\n3. 显示初始系统状态...');
        bot.displayStatus();
        
        // 4. 运行几次扫描
        console.log('\n4. 运行测试扫描...');
        const scanCount = 3;
        
        for (let i = 1; i <= scanCount; i++) {
            console.log(`\n  扫描 ${i}/${scanCount}...`);
            await bot.performScan();
            
            // 显示状态更新
            const stats = bot.getSystemInfo().stats;
            console.log(`    扫描次数: ${stats.scans}`);
            console.log(`    检测信号: ${stats.signals}`);
            console.log(`    执行交易: ${stats.trades}`);
            
            // 等待一段时间
            if (i < scanCount) {
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
        
        // 5. 显示最终状态
        console.log('\n5. 显示最终系统状态...');
        bot.displayStatus();
        
        // 6. 停止系统（会清理记忆系统）
        console.log('\n6. 停止系统...');
        bot.stop();
        
        // 7. 验证记忆数据
        console.log('\n7. 验证记忆数据...');
        const fs = require('fs').promises;
        const path = require('path');
        
        const memoryDir = './memory';
        try {
            const files = await fs.readdir(memoryDir);
            console.log(`  记忆目录文件数: ${files.length}`);
            
            // 检查记忆数据文件
            const memoryDataFile = path.join(memoryDir, 'memory_data.json');
            try {
                const data = await fs.readFile(memoryDataFile, 'utf8');
                const memoryData = JSON.parse(data);
                console.log(`  市场数据条目: ${Object.keys(memoryData.marketData || {}).length}`);
                console.log(`  信号数量: ${(memoryData.signals || []).length}`);
                console.log(`  交易数量: ${(memoryData.trades || []).length}`);
                console.log(`  用户偏好: ${Object.keys(memoryData.userPreferences || {}).length} 个用户`);
            } catch (error) {
                console.log(`  记忆数据文件不存在或无法读取: ${error.message}`);
            }
            
            // 检查报告文件
            const reportFiles = files.filter(f => f.startsWith('memory_report_') && f.endsWith('.json'));
            console.log(`  报告文件数: ${reportFiles.length}`);
            
        } catch (error) {
            console.log(`  无法读取记忆目录: ${error.message}`);
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ 记忆系统集成测试完成');
        console.log('='.repeat(60));
        
        return true;
        
    } catch (error) {
        console.error('\n❌ 测试失败:', error);
        return false;
    }
}

// 运行测试
if (require.main === module) {
    testMemoryIntegration()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('测试执行失败:', error);
            process.exit(1);
        });
}

module.exports = { testMemoryIntegration };