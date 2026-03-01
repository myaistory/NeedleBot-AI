#!/usr/bin/env node
/**
 * Jupiter API 真实交易测试
 * 
 * 测试真实的 Jupiter API 调用，包括：
 * 1. 获取报价
 * 2. 交易模拟
 * 3. 价格影响分析
 * 4. 代币信息获取
 * 
 * 注意：这是只读测试，不会实际执行交易
 */

const JupiterClient = require('../src/trading/jupiter-client');
const { OrderManager, OrderType } = require('../src/trading/order-manager');

// 测试配置
const TEST_CONFIG = {
    // RPC 配置
    rpc: {
        endpoint: 'https://purple-wiser-tab.solana-mainnet.quiknode.pro',
        timeout: 10000
    },
    
    // Jupiter 配置
    jupiter: {
        baseUrl: 'https://api.jup.ag/v6',
        timeout: 15000
    },
    
    // 交易配置
    trading: {
        defaultSlippageBps: 50, // 0.5%
        maxSlippageBps: 100,    // 1%
        minLiquidity: 1000      // $1000
    }
};

// 测试代币对
const TEST_TOKEN_PAIRS = [
    { input: 'SOL', output: 'USDC', amount: 0.01 }, // 0.01 SOL → USDC
    { input: 'USDC', output: 'SOL', amount: 1 },    // 1 USDC → SOL
];

// 测试结果统计
const testResults = {
    total: 0,
    passed: 0,
    failed: 0,
    details: []
};

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testJupiterAPI() {
    console.log('🚀 开始 Jupiter API 真实交易测试');
    console.log('='.repeat(70));
    console.log('📅 测试时间:', new Date().toISOString());
    console.log('🌐 RPC 端点:', TEST_CONFIG.rpc.endpoint);
    console.log('🔗 Jupiter API:', TEST_CONFIG.jupiter.baseUrl);
    console.log('='.repeat(70));
    
    // 创建客户端
    const client = new JupiterClient(TEST_CONFIG);
    console.log('✅ Jupiter 客户端已创建');
    
    // 测试 1: 获取代币列表
    console.log('\n📋 测试 1: 获取代币列表');
    try {
        const tokens = await client.getTokenList();
        console.log(`✅ 获取到 ${Object.keys(tokens).length} 个代币`);
        
        // 查找一些热门代币
        const popularTokens = [];
        for (const [address, token] of Object.entries(tokens)) {
            if (['SOL', 'USDC', 'USDT', 'BONK', 'WIF', 'POPCAT', 'WEN'].includes(token.symbol)) {
                popularTokens.push({ address, ...token });
            }
        }
        
        console.log('🔥 热门代币:');
        popularTokens.forEach(token => {
            console.log(`   ${token.symbol}: ${token.address} (${token.decimals} 小数位)`);
        });
        
        testResults.total++;
        testResults.passed++;
        testResults.details.push({ test: '获取代币列表', status: 'passed', tokens: popularTokens.length });
    } catch (error) {
        console.error('❌ 获取代币列表失败:', error.message);
        testResults.total++;
        testResults.failed++;
        testResults.details.push({ test: '获取代币列表', status: 'failed', error: error.message });
    }
    
    await sleep(1000); // 避免速率限制
    
    // 测试 2: 测试多个代币对报价
    console.log('\n💰 测试 2: 多代币对报价测试');
    for (const pair of TEST_TOKEN_PAIRS) {
        try {
            console.log(`\n  测试 ${pair.input} → ${pair.output} (${pair.amount} ${pair.input})`);
            
            const inputToken = client.tokens[pair.input];
            const outputToken = client.tokens[pair.output];
            
            if (!inputToken || !outputToken) {
                console.error(`   ❌ 代币地址未找到: ${pair.input} 或 ${pair.output}`);
                continue;
            }
            
            // 计算金额（考虑小数位）
            const amount = pair.input === 'SOL' ? pair.amount * 1e9 : pair.amount * 1e6;
            
            const quote = await client.getQuote(
                inputToken,
                outputToken,
                amount,
                TEST_CONFIG.trading.defaultSlippageBps
            );
            
            console.log(`  ✅ 报价获取成功`);
            console.log(`     输入: ${pair.amount} ${pair.input}`);
            console.log(`     输出: ${quote.outAmount / (outputToken === client.tokens.USDC ? 1e6 : 1e9)} ${pair.output}`);
            console.log(`     价格影响: ${(quote.priceImpact * 100).toFixed(4)}%`);
            console.log(`     滑点: ${quote.slippageBps / 100}%`);
            console.log(`     路由: ${quote.routePlan?.length || 1} 步`);
            
            testResults.total++;
            testResults.passed++;
            testResults.details.push({ 
                test: `${pair.input}→${pair.output}报价`, 
                status: 'passed',
                inputAmount: pair.amount,
                outputAmount: quote.outAmount / (outputToken === client.tokens.USDC ? 1e6 : 1e9),
                priceImpact: quote.priceImpact
            });
            
        } catch (error) {
            console.error(`  ❌ ${pair.input}→${pair.output} 报价失败:`, error.message);
            testResults.total++;
            testResults.failed++;
            testResults.details.push({ 
                test: `${pair.input}→${pair.output}报价`, 
                status: 'failed', 
                error: error.message 
            });
        }
        
        await sleep(1500); // 避免速率限制
    }
    
    // 测试 3: 交易模拟
    console.log('\n🔍 测试 3: 交易模拟测试');
    try {
        // 使用 SOL → USDC 进行模拟
        const inputToken = client.tokens.SOL;
        const outputToken = client.tokens.USDC;
        const amount = 0.01 * 1e9; // 0.01 SOL
        
        const quote = await client.getQuote(inputToken, outputToken, amount);
        
        // 获取交换指令（使用虚拟钱包地址）
        const swapInstruction = await client.getSwapInstruction(
            quote,
            '11111111111111111111111111111111' // 虚拟地址
        );
        
        // 模拟交易
        const simulation = await client.simulateTransaction(swapInstruction.swapTransaction);
        
        console.log(`✅ 交易模拟成功`);
        console.log(`   模拟状态: ${simulation.success ? '成功' : '失败'}`);
        console.log(`   预估gas费用: ${simulation.estimatedGasFee || 'N/A'} lamports`);
        console.log(`   错误信息: ${simulation.error || '无'}`);
        
        testResults.total++;
        testResults.passed++;
        testResults.details.push({ 
            test: '交易模拟', 
            status: 'passed',
            simulationSuccess: simulation.success
        });
        
    } catch (error) {
        console.error('❌ 交易模拟失败:', error.message);
        testResults.total++;
        testResults.failed++;
        testResults.details.push({ 
            test: '交易模拟', 
            status: 'failed', 
            error: error.message 
        });
    }
    
    // 测试 4: 价格影响分析
    console.log('\n📊 测试 4: 价格影响分析');
    try {
        // 先获取一个报价
        const quote = await client.getQuote(
            client.tokens.SOL,
            client.tokens.USDC,
            0.01 * 1e9 // 0.01 SOL
        );
        
        // 分析价格影响
        const analysis = await client.analyzePriceImpact(quote);
        
        console.log(`✅ 价格影响分析成功`);
        console.log(`   价格影响: ${analysis.priceImpactPercent.toFixed(4)}%`);
        console.log(`   严重程度: ${analysis.severity}`);
        console.log(`   建议: ${analysis.recommendation}`);
        
        testResults.total++;
        testResults.passed++;
        testResults.details.push({ 
            test: '价格影响分析', 
            status: 'passed',
            priceImpact: analysis.priceImpactPercent,
            severity: analysis.severity
        });
        
    } catch (error) {
        console.error('❌ 价格影响分析失败:', error.message);
        testResults.total++;
        testResults.failed++;
        testResults.details.push({ 
            test: '价格影响分析', 
            status: 'failed', 
            error: error.message 
        });
    }
    
    // 测试 5: OrderManager 功能测试
    console.log('\n📦 测试 5: OrderManager 功能测试');
    try {
        const orderManager = new OrderManager(TEST_CONFIG);
        
        // 创建模拟订单（不实际执行）
        const order = await orderManager.createOrder(
            OrderType.BUY,
            client.tokens.USDC,
            client.tokens.SOL,
            10 * 1e6, // 10 USDC
            { slippageBps: 50 }
        );
        
        const orderId = order.id;
        
        console.log(`✅ OrderManager 创建订单成功`);
        console.log(`   订单ID: ${orderId}`);
        console.log(`   订单数量: ${orderManager.orders.size}`);
        
        // 获取订单状态
        const orderStatus = orderManager.getOrder(orderId);
        console.log(`   订单状态: ${orderStatus.status}`);
        console.log(`   订单类型: ${orderStatus.type}`);
        
        testResults.total++;
        testResults.passed++;
        testResults.details.push({ 
            test: 'OrderManager 功能', 
            status: 'passed',
            orderId: orderId,
            orderCount: orderManager.orders.size
        });
        
    } catch (error) {
        console.error('❌ OrderManager 功能测试失败:', error.message);
        testResults.total++;
        testResults.failed++;
        testResults.details.push({ 
            test: 'OrderManager 功能', 
            status: 'failed', 
            error: error.message 
        });
    }
    
    // 输出测试总结
    console.log('\n' + '='.repeat(70));
    console.log('📊 测试总结');
    console.log('='.repeat(70));
    console.log(`✅ 通过: ${testResults.passed}`);
    console.log(`❌ 失败: ${testResults.failed}`);
    console.log(`📋 总计: ${testResults.total}`);
    console.log(`📈 成功率: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);
    
    // 详细结果
    console.log('\n📝 详细测试结果:');
    testResults.details.forEach((detail, index) => {
        const statusIcon = detail.status === 'passed' ? '✅' : '❌';
        console.log(`  ${index + 1}. ${statusIcon} ${detail.test}`);
        if (detail.status === 'failed') {
            console.log(`     错误: ${detail.error}`);
        }
    });
    
    console.log('\n' + '='.repeat(70));
    console.log('🎯 Jupiter API 真实交易测试完成');
    console.log('💡 注意: 所有测试均为只读操作，未执行真实交易');
    console.log('='.repeat(70));
    
    // 返回测试结果
    return {
        success: testResults.failed === 0,
        summary: {
            total: testResults.total,
            passed: testResults.passed,
            failed: testResults.failed,
            successRate: (testResults.passed / testResults.total) * 100
        },
        details: testResults.details
    };
}

// 运行测试
if (require.main === module) {
    testJupiterAPI()
        .then(results => {
            if (results.success) {
                console.log('\n🎉 所有测试通过！Jupiter API 集成正常。');
                process.exit(0);
            } else {
                console.log('\n⚠️  部分测试失败，请检查问题。');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('💥 测试执行失败:', error);
            process.exit(1);
        });
}

module.exports = { testJupiterAPI, TEST_CONFIG };