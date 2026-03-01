#!/usr/bin/env node
/**
 * Jupiter API 完整集成测试
 * 
 * 测试所有Jupiter API功能，包括：
 * 1. 连接测试
 * 2. 报价获取
 * 3. 价格分析
 * 4. 订单管理
 * 5. 错误处理
 */

const fs = require('fs');
const path = require('path');

// 加载配置
const configPath = path.join(__dirname, '../config/jupiter-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// 导入模块
const JupiterClient = require('../src/trading/jupiter-client');
const { OrderManager, OrderType } = require('../src/trading/order-manager');

console.log('🚀 Jupiter API 完整集成测试');
console.log('='.repeat(70));
console.log(`配置状态: ${config.apiKey ? '✅ API密钥已配置' : '❌ API密钥未配置'}`);
console.log(`基础URL: ${config.baseUrl}`);
console.log(`版本: ${config.version}`);
console.log('');

async function runAllTests() {
    const testResults = {
        total: 0,
        passed: 0,
        failed: 0,
        errors: []
    };

    // 测试配置
    const testConfig = {
        jupiter: {
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
            timeout: 10000,
            maxRetries: 3,
            retryDelay: 1000,
            endpoints: config.endpoints
        },
        rpc: {
            endpoint: 'https://purple-wiser-tab.solana-mainnet.quiknode.pro',
            timeout: 5000
        },
        trading: {
            defaultSlippageBps: config.defaultSlippageBps || 50,
            maxSlippageBps: 100,
            minLiquidity: 1000
        },
        orderManager: {
            maxRetries: 3,
            orderTimeout: 300000
        }
    };

    console.log('🔧 创建客户端实例...\n');

    try {
        // 测试 1: JupiterClient 初始化
        console.log('🧪 测试 1: JupiterClient 初始化');
        testResults.total++;
        const jupiterClient = new JupiterClient(testConfig);
        console.log('✅ JupiterClient 创建成功');
        testResults.passed++;

        // 测试 2: 连接测试
        console.log('\n🧪 测试 2: API 连接测试');
        testResults.total++;
        try {
            // 使用简单的健康检查端点
            const response = await jupiterClient.axiosInstance.get('/swap/v1/quote', {
                params: {
                    inputMint: 'So11111111111111111111111111111111111111112',
                    outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                    amount: '1000000000',
                    slippageBps: 50
                }
            });
            if (response.status === 200) {
                console.log('✅ API 连接成功');
                testResults.passed++;
            } else {
                console.log(`❌ API 连接失败: 状态码 ${response.status}`);
                testResults.failed++;
                testResults.errors.push(`API连接失败: ${response.status}`);
            }
        } catch (error) {
            console.log(`❌ API 连接失败: ${error.message}`);
            testResults.failed++;
            testResults.errors.push(`API连接失败: ${error.message}`);
        }

        // 测试 3: 获取报价
        console.log('\n🧪 测试 3: 获取报价 (SOL → USDC)');
        testResults.total++;
        try {
            const quote = await jupiterClient.getQuote(
                'So11111111111111111111111111111111111111112',
                'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                1000000000, // 1 SOL
                50 // 0.5% 滑点
            );
            
            if (quote && quote.outAmount) {
                const solAmount = 1;
                const usdcAmount = quote.outAmount / 1e6;
                console.log(`✅ 报价获取成功: 1 SOL = ${usdcAmount.toFixed(6)} USDC`);
                console.log(`   价格影响: ${(quote.priceImpact * 100).toFixed(6)}%`);
                console.log(`   交易路径: ${quote.routePlan?.length || 1} 个步骤`);
                testResults.passed++;
            } else {
                console.log('❌ 报价数据无效');
                testResults.failed++;
                testResults.errors.push('报价数据无效');
            }
        } catch (error) {
            console.log(`❌ 报价获取失败: ${error.message}`);
            testResults.failed++;
            testResults.errors.push(`报价获取失败: ${error.message}`);
        }

        // 测试 4: 价格影响分析
        console.log('\n🧪 测试 4: 价格影响分析');
        testResults.total++;
        try {
            const quote = await jupiterClient.getQuote(
                'So11111111111111111111111111111111111111112',
                'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                1000000000, // 1 SOL
                50
            );
            
            const analysis = await jupiterClient.analyzePriceImpact(quote);
            console.log(`✅ 价格影响分析: ${analysis.severity}`);
            console.log(`   建议: ${analysis.recommendation}`);
            console.log(`   影响程度: ${analysis.impactLevel}`);
            testResults.passed++;
        } catch (error) {
            console.log(`❌ 价格影响分析失败: ${error.message}`);
            testResults.failed++;
            testResults.errors.push(`价格影响分析失败: ${error.message}`);
        }

        // 测试 5: OrderManager 初始化
        console.log('\n🧪 测试 5: OrderManager 初始化');
        testResults.total++;
        try {
            const orderManager = new OrderManager(testConfig);
            console.log('✅ OrderManager 创建成功');
            testResults.passed++;

            // 测试 6: 创建模拟订单
            console.log('\n🧪 测试 6: 创建模拟订单');
            testResults.total++;
            try {
                const order = await orderManager.createOrder(
                    OrderType.BUY,
                    'So11111111111111111111111111111111111111112',
                    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                    0.1 * 1e9, // 0.1 SOL
                    { slippageBps: 50 }
                );
                
                if (order && order.id) {
                    console.log(`✅ 订单创建成功: ${order.id}`);
                    console.log(`   类型: ${order.type}`);
                    console.log(`   状态: ${order.status}`);
                    console.log(`   金额: ${order.amount / 1e9} SOL`);
                    testResults.passed++;
                    
                    // 测试 7: 获取订单状态
                    console.log('\n🧪 测试 7: 获取订单状态');
                    testResults.total++;
                    const orderStatus = orderManager.getOrder(order.id);
                    if (orderStatus) {
                        console.log(`✅ 订单状态获取成功: ${orderStatus.status}`);
                        testResults.passed++;
                    } else {
                        console.log('❌ 订单状态获取失败');
                        testResults.failed++;
                        testResults.errors.push('订单状态获取失败');
                    }
                } else {
                    console.log('❌ 订单创建失败');
                    testResults.failed++;
                    testResults.errors.push('订单创建失败');
                }
            } catch (error) {
                console.log(`❌ 订单创建失败: ${error.message}`);
                testResults.failed++;
                testResults.errors.push(`订单创建失败: ${error.message}`);
            }

            // 测试 8: 获取统计信息
            console.log('\n🧪 测试 8: 获取统计信息');
            testResults.total++;
            try {
                const stats = orderManager.getStats();
                console.log('✅ 统计信息获取成功:');
                console.log(`   总订单数: ${stats.totalOrders}`);
                console.log(`   成功订单: ${stats.successfulOrders}`);
                console.log(`   失败订单: ${stats.failedOrders}`);
                console.log(`   活跃订单: ${stats.activeOrders}`);
                testResults.passed++;
            } catch (error) {
                console.log(`❌ 统计信息获取失败: ${error.message}`);
                testResults.failed++;
                testResults.errors.push(`统计信息获取失败: ${error.message}`);
            }

        } catch (error) {
            console.log(`❌ OrderManager 初始化失败: ${error.message}`);
            testResults.failed++;
            testResults.errors.push(`OrderManager初始化失败: ${error.message}`);
        }

        // 测试 9: 错误处理测试
        console.log('\n🧪 测试 9: 错误处理测试');
        testResults.total++;
        try {
            // 测试无效的代币地址
            await jupiterClient.getQuote(
                'INVALID_TOKEN_ADDRESS',
                'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                1000000000,
                50
            );
            console.log('❌ 错误处理测试失败: 应该抛出错误');
            testResults.failed++;
            testResults.errors.push('错误处理测试失败');
        } catch (error) {
            console.log(`✅ 错误处理正常: ${error.message}`);
            testResults.passed++;
        }

    } catch (error) {
        console.log(`❌ 测试初始化失败: ${error.message}`);
        testResults.failed++;
        testResults.errors.push(`测试初始化失败: ${error.message}`);
    }

    // 测试结果总结
    console.log('\n' + '='.repeat(70));
    console.log('📊 测试结果总结');
    console.log('='.repeat(70));
    console.log(`总测试数: ${testResults.total}`);
    console.log(`通过数: ${testResults.passed}`);
    console.log(`失败数: ${testResults.failed}`);
    console.log(`通过率: ${((testResults.passed / testResults.total) * 100).toFixed(2)}%`);
    
    if (testResults.failed > 0) {
        console.log('\n❌ 失败详情:');
        testResults.errors.forEach((error, index) => {
            console.log(`  ${index + 1}. ${error}`);
        });
    } else {
        console.log('\n✅ 所有测试通过！');
    }

    // 返回测试结果
    return testResults;
}

// 运行测试
(async () => {
    try {
        const results = await runAllTests();
        
        // 根据测试结果决定退出码
        if (results.failed > 0) {
            console.log('\n⚠️ 部分测试失败，需要修复');
            process.exit(1);
        } else {
            console.log('\n🎉 Jupiter API 集成测试完全通过！');
            console.log('系统已准备好进行真实交易测试。');
            process.exit(0);
        }
    } catch (error) {
        console.error('测试执行失败:', error);
        process.exit(1);
    }
})();