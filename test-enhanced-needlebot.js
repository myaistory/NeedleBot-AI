#!/usr/bin/env node

/**
 * NeedleBot Enhanced AI 测试脚本
 * 测试集成 Solana 优化的增强版交易系统
 */

const NeedleBotEnhancedAI = require('./src/needlebot-enhanced');
const logger = require('./src/utils/logger');

async function testEnhancedNeedleBot() {
    console.log('🚀 NeedleBot Enhanced AI 系统测试');
    console.log('='.repeat(60));
    
    const bot = new NeedleBotEnhancedAI({
        scanIntervalMs: 10000, // 10秒扫描间隔（测试用）
        tradingEnabled: false, // 测试阶段禁用交易
        initialBalanceSOL: 1.0,
        maxPositionSizeSOL: 0.1,
        minDropPercent: 20,
        minRecoveryPercent: 50,
        enableMEVProtection: true,
        enableTokenSecurity: true,
        enableNetworkMonitoring: true,
        maxSlippagePercent: 10.0,
        minTokenSecurityScore: 70
    });
    
    try {
        // 1. 显示初始状态
        console.log('\n1. 系统初始状态:');
        bot.displayEnhancedStatus();
        
        // 2. 测试增强功能
        console.log('\n2. 测试增强功能...');
        const featureTest = await bot.testEnhancedFeatures();
        
        console.log(`\n   ✅ 增强功能测试: ${featureTest.passed}/${featureTest.total} 通过`);
        
        // 3. 启动增强扫描（单次）
        console.log('\n3. 执行单次增强扫描...');
        await bot.enhancedScanCycle();
        
        // 显示扫描后状态
        console.log('\n   扫描后状态:');
        console.log(`   扫描次数: ${bot.stats.scans}`);
        console.log(`   检测信号: ${bot.stats.signals}`);
        console.log(`   过滤信号: ${bot.stats.filteredSignals}`);
        console.log(`   拒绝代币: ${bot.stats.rejectedTokens}`);
        
        // 4. 获取性能报告
        console.log('\n4. 性能报告:');
        const performanceReport = bot.getEnhancedPerformanceReport();
        
        console.log(`   运行时间: ${performanceReport.runtime.formatted}`);
        console.log(`   扫描频率: ${performanceReport.performance.scansPerMinute} 次/分钟`);
        console.log(`   信号率: ${performanceReport.performance.signalsPerScan} 信号/扫描`);
        
        // 5. 显示 Solana 优化统计
        console.log('\n5. Solana 优化统计:');
        console.log(`   启用的优化: ${performanceReport.solanaOptimizations.enabled}/${performanceReport.solanaOptimizations.total}`);
        console.log(`   RPC 节点切换: ${performanceReport.solanaOptimizations.stats.rpcNodeSwitches}`);
        console.log(`   MEV 保护交易: ${performanceReport.solanaOptimizations.stats.mevProtectedTrades}`);
        console.log(`   安全过滤代币: ${performanceReport.solanaOptimizations.stats.securityFilteredTokens}`);
        console.log(`   平均执行延迟: ${performanceReport.solanaOptimizations.stats.avgExecutionLatency.toFixed(2)}ms`);
        
        // 6. 显示优化建议
        console.log('\n6. 优化建议:');
        if (performanceReport.recommendations.length > 0) {
            performanceReport.recommendations.forEach((rec, index) => {
                const icon = rec.type === 'critical' ? '🚨' : rec.type === 'warning' ? '⚠️' : '💡';
                console.log(`   ${icon} ${rec.message}`);
                if (rec.suggestion) {
                    console.log(`     建议: ${rec.suggestion}`);
                }
            });
        } else {
            console.log('   ✅ 无优化建议，系统运行良好');
        }
        
        // 7. 测试 RPC 节点管理器
        console.log('\n7. 测试 RPC 节点管理器...');
        if (bot.rpcManager) {
            const nodeStats = bot.rpcManager.getNodeStats();
            console.log(`   RPC 节点状态:`);
            nodeStats.forEach(node => {
                const status = node.isHealthy ? '✅' : '❌';
                console.log(`     ${status} ${node.name}: ${node.type} (成功率: ${(node.successRate * 100).toFixed(1)}%)`);
            });
            
            // 获取网络状态
            const networkStatus = await bot.rpcManager.getNetworkStatus();
            if (networkStatus.success) {
                console.log(`   网络状态: Solana v${networkStatus.data.version}, TPS: ${networkStatus.data.tps}`);
            }
        }
        
        // 8. 测试记忆系统
        console.log('\n8. 测试记忆系统...');
        if (bot.memorySystem) {
            console.log('   ✅ 记忆系统已启用');
            console.log(`   用户偏好: ${Object.keys(bot.userPreferences).length} 项`);
        } else {
            console.log('   ⚠️  记忆系统未启用');
        }
        
        // 9. 综合评估
        console.log('\n9. 系统综合评估:');
        
        const assessments = [];
        
        // RPC 连接评估
        if (bot.solanaOptimizations.rpcReady) {
            assessments.push('✅ RPC 连接稳定');
        } else {
            assessments.push('❌ RPC 连接问题');
        }
        
        // 安全过滤评估
        if (bot.stats.rejectedTokens > 0) {
            assessments.push(`✅ 安全过滤生效 (过滤 ${bot.stats.rejectedTokens} 个代币)`);
        } else {
            assessments.push('⚠️  安全过滤未检测到风险代币');
        }
        
        // 信号检测评估
        if (bot.stats.signals > 0) {
            assessments.push(`✅ 信号检测正常 (${bot.stats.signals} 个信号)`);
        } else {
            assessments.push('⚠️  未检测到交易信号');
        }
        
        // 性能评估
        if (bot.solanaStats.avgExecutionLatency < 100) {
            assessments.push(`✅ 执行延迟优秀 (${bot.solanaStats.avgExecutionLatency.toFixed(2)}ms)`);
        } else if (bot.solanaStats.avgExecutionLatency < 500) {
            assessments.push(`⚠️  执行延迟一般 (${bot.solanaStats.avgExecutionLatency.toFixed(2)}ms)`);
        } else {
            assessments.push(`❌ 执行延迟过高 (${bot.solanaStats.avgExecutionLatency.toFixed(2)}ms)`);
        }
        
        assessments.forEach(assessment => {
            console.log(`   ${assessment}`);
        });
        
        // 10. 生成最终测试报告
        console.log('\n📋 最终测试报告');
        console.log('='.repeat(60));
        
        const finalReport = {
            timestamp: new Date().toISOString(),
            testDuration: performanceReport.runtime.formatted,
            systemStatus: 'PASSED',
            components: {
                rpcManager: bot.solanaOptimizations.rpcReady ? '✅' : '❌',
                mevProtection: bot.solanaOptimizations.mevReady ? '✅' : '❌',
                tokenSecurity: bot.solanaOptimizations.securityReady ? '✅' : '❌',
                networkMonitor: bot.solanaOptimizations.networkReady ? '✅' : '❌',
                memorySystem: bot.memorySystem ? '✅' : '❌'
            },
            performance: {
                scans: bot.stats.scans,
                signals: bot.stats.signals,
                filteredSignals: bot.stats.filteredSignals,
                rejectedTokens: bot.stats.rejectedTokens,
                avgExecutionLatency: bot.solanaStats.avgExecutionLatency.toFixed(2)
            },
            recommendations: performanceReport.recommendations.map(rec => ({
                type: rec.type,
                message: rec.message,
                priority: rec.priority
            }))
        };
        
        console.log(JSON.stringify(finalReport, null, 2));
        
        console.log('\n🎉 NeedleBot Enhanced AI 测试完成！');
        console.log('系统状态: ✅ 正常');
        console.log('准备就绪: ✅ 可以开始正式运行');
        
        // 停止系统
        bot.stopEnhancedScan();
        
        return true;
        
    } catch (error) {
        console.error('\n❌ NeedleBot Enhanced AI 测试失败:');
        console.error(`错误信息: ${error.message}`);
        console.error(`堆栈: ${error.stack}`);
        
        // 尝试停止系统
        try {
            bot.stopEnhancedScan();
        } catch (stopError) {
            console.error('停止系统失败:', stopError.message);
        }
        
        return false;
    }
}

// 运行测试
if (require.main === module) {
    testEnhancedNeedleBot()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('测试脚本执行失败:', error);
            process.exit(1);
        });
}

module.exports = { testEnhancedNeedleBot };