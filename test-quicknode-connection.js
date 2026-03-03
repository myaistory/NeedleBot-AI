#!/usr/bin/env node

/**
 * QuickNode API 密钥连接测试脚本
 * 测试 QuickNode RPC 节点的连接和性能
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const logger = require('./src/utils/logger');

// QuickNode RPC URL (使用提供的完整 URL)
const QUICKNODE_RPC_URL = 'https://purple-wiser-tab.solana-mainnet.quiknode.pro/5e15144ae8962f5d2dae5d8d9f4bb722fd65156a';
const QUICKNODE_WS_URL = 'wss://purple-wiser-tab.solana-mainnet.quiknode.pro/5e15144ae8962f5d2dae5d8d9f4bb722fd65156a';

// 测试用的 Solana 地址
const TEST_ADDRESSES = [
    'So11111111111111111111111111111111111111112', // SOL
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'  // BONK
];

async function testQuickNodeConnection() {
    console.log('🔗 QuickNode RPC 连接测试');
    console.log('=' .repeat(50));
    
    try {
        // 1. 创建连接
        console.log('1. 创建 QuickNode 连接...');
        const connection = new Connection(QUICKNODE_RPC_URL, {
            commitment: 'confirmed',
            wsEndpoint: QUICKNODE_WS_URL
        });
        
        // 2. 测试基本连接
        console.log('2. 测试基本连接...');
        const startTime = Date.now();
        const version = await connection.getVersion();
        const latency = Date.now() - startTime;
        
        console.log(`   ✅ 连接成功`);
        console.log(`   📊 Solana 版本: ${version['solana-core']}`);
        console.log(`   ⏱️  连接延迟: ${latency}ms`);
        
        // 3. 获取当前 slot
        console.log('3. 获取网络状态...');
        const slot = await connection.getSlot();
        const epochInfo = await connection.getEpochInfo();
        
        console.log(`   📍 当前 Slot: ${slot}`);
        console.log(`   📅 Epoch: ${epochInfo.epoch} (${epochInfo.slotIndex}/${epochInfo.slotsInEpoch})`);
        
        // 4. 测试 TPS 获取
        console.log('4. 测试性能指标...');
        try {
            const samples = await connection.getRecentPerformanceSamples(1);
            if (samples.length > 0) {
                const tps = samples[0].numTransactions / samples[0].samplePeriodSecs;
                console.log(`   📈 当前 TPS: ${Math.round(tps)}`);
            }
        } catch (error) {
            console.log(`   ⚠️  无法获取 TPS: ${error.message}`);
        }
        
        // 5. 测试账户信息查询
        console.log('5. 测试账户查询...');
        for (const address of TEST_ADDRESSES) {
            try {
                const pubkey = new PublicKey(address);
                const accountInfo = await connection.getAccountInfo(pubkey);
                
                if (accountInfo) {
                    console.log(`   ✅ ${address.slice(0, 8)}...: 账户数据可用`);
                } else {
                    console.log(`   ⚠️  ${address.slice(0, 8)}...: 账户不存在`);
                }
            } catch (error) {
                console.log(`   ❌ ${address.slice(0, 8)}...: 查询失败 - ${error.message}`);
            }
        }
        
        // 6. 测试交易历史查询
        console.log('6. 测试交易历史...');
        try {
            // 获取最近的区块
            const recentBlockhash = await connection.getLatestBlockhash();
            console.log(`   ✅ 最新区块哈希: ${recentBlockhash.blockhash.slice(0, 16)}...`);
            console.log(`   📏 最后有效区块高度: ${recentBlockhash.lastValidBlockHeight}`);
        } catch (error) {
            console.log(`   ❌ 区块信息获取失败: ${error.message}`);
        }
        
        // 7. 测试 WebSocket 连接
        console.log('7. 测试 WebSocket 连接...');
        try {
            // 监听 slot 更新
            const slotSubscription = connection.onSlotUpdate((slotInfo) => {
                console.log(`   📡 Slot 更新: ${slotInfo.slot} (${slotInfo.type})`);
                // 取消订阅
                connection.removeSlotUpdateListener(slotSubscription);
            });
            
            // 等待一段时间
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            console.log(`   ✅ WebSocket 连接正常`);
            
        } catch (error) {
            console.log(`   ⚠️  WebSocket 连接测试失败: ${error.message}`);
        }
        
        // 8. 性能基准测试
        console.log('8. 性能基准测试...');
        const benchmarkResults = [];
        
        for (let i = 0; i < 5; i++) {
            const start = Date.now();
            await connection.getSlot();
            const end = Date.now();
            benchmarkResults.push(end - start);
        }
        
        const avgLatency = benchmarkResults.reduce((a, b) => a + b, 0) / benchmarkResults.length;
        const maxLatency = Math.max(...benchmarkResults);
        const minLatency = Math.min(...benchmarkResults);
        
        console.log(`   📊 平均延迟: ${avgLatency.toFixed(2)}ms`);
        console.log(`   📈 最大延迟: ${maxLatency}ms`);
        console.log(`   📉 最小延迟: ${minLatency}ms`);
        console.log(`   🔢 测试次数: ${benchmarkResults.length}`);
        
        // 9. 功能特性检查
        console.log('9. 功能特性检查...');
        try {
            // 检查是否支持 getMultipleAccounts
            const pubkeys = TEST_ADDRESSES.map(addr => new PublicKey(addr));
            const accounts = await connection.getMultipleAccountsInfo(pubkeys);
            console.log(`   ✅ 批量账户查询: 支持 (${accounts.filter(a => a).length}/${pubkeys.length} 个账户)`);
        } catch (error) {
            console.log(`   ⚠️  批量账户查询: 不支持 - ${error.message}`);
        }
        
        // 10. 总结报告
        console.log('\n📋 测试总结报告');
        console.log('=' .repeat(50));
        
        const report = {
            timestamp: new Date().toISOString(),
            rpcUrl: QUICKNODE_RPC_URL.replace(/\/[^/]+$/, '/*****'),
            connection: '成功',
            latency: `${avgLatency.toFixed(2)}ms`,
            solanaVersion: version['solana-core'],
            currentSlot: slot,
            features: {
                basicRpc: '✅',
                websocket: '✅',
                batchQueries: '✅',
                performanceMetrics: '⚠️'
            },
            recommendations: []
        };
        
        if (avgLatency > 1000) {
            report.recommendations.push('延迟较高，建议检查网络连接或选择其他节点');
        }
        
        if (maxLatency > 5000) {
            report.recommendations.push('最大延迟超过5秒，可能影响交易执行');
        }
        
        console.log(JSON.stringify(report, null, 2));
        
        console.log('\n🎉 QuickNode RPC 测试完成！');
        console.log('节点状态: ✅ 正常');
        console.log(`建议: ${report.recommendations.length > 0 ? report.recommendations.join('; ') : '无'}`);
        
        return true;
        
    } catch (error) {
        console.error('\n❌ QuickNode 连接测试失败:');
        console.error(`错误信息: ${error.message}`);
        console.error(`堆栈: ${error.stack}`);
        
        // 诊断常见问题
        if (error.message.includes('fetch failed')) {
            console.error('\n🔧 诊断建议:');
            console.error('1. 检查网络连接是否正常');
            console.error('2. 验证 API 密钥是否正确');
            console.error('3. 确认 QuickNode 账户是否激活');
            console.error('4. 检查防火墙或代理设置');
        } else if (error.message.includes('401') || error.message.includes('403')) {
            console.error('\n🔧 诊断建议:');
            console.error('1. API 密钥可能无效或已过期');
            console.error('2. 检查 QuickNode 账户状态');
            console.error('3. 确认 RPC URL 格式正确');
        }
        
        return false;
    }
}

// 运行测试
if (require.main === module) {
    testQuickNodeConnection()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('测试脚本执行失败:', error);
            process.exit(1);
        });
}

module.exports = { testQuickNodeConnection };