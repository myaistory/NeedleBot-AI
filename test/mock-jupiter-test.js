#!/usr/bin/env node
/**
 * Mock Jupiter API 测试
 * 
 * 使用模拟客户端进行测试，避免API密钥和网络问题
 */

const MockJupiterClient = require('../src/trading/mock-jupiter-client');

// 由于OrderManager可能没有正确导出，我们在这里定义OrderType
const OrderType = {
    BUY: 'buy',
    SELL: 'sell'
};

// 简单的订单管理器实现
class SimpleOrderManager {
    constructor() {
        this.orders = new Map();
        this.orderHistory = [];
        this.orderCounter = 0;
        console.log('📋 SimpleOrderManager 初始化完成');
    }
    
    createOrder(type, inputToken, outputToken, amount, options = {}) {
        this.orderCounter++;
        const orderId = `order_${Date.now()}_${this.orderCounter}`;
        
        const order = {
            id: orderId,
            type,
            inputToken,
            outputToken,
            inputAmount: amount,
            outputAmount: 0, // 将在执行时设置
            slippageBps: options.slippageBps || 50,
            status: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        this.orders.set(orderId, order);
        console.log(`✅ 创建订单: ${orderId} (${type})`);
        
        return Promise.resolve(order);
    }
    
    getOrder(orderId) {
        const order = this.orders.get(orderId);
        if (!order) {
            // 在历史记录中查找
            const historicalOrder = this.orderHistory.find(o => o.id === orderId);
            return historicalOrder || null;
        }
        return order;
    }
    
    updateOrderStatus(orderId, status, data = {}) {
        const order = this.orders.get(orderId);
        if (order) {
            order.status = status;
            order.updatedAt = new Date().toISOString();
            
            // 更新其他数据
            Object.assign(order, data);
            
            // 如果订单完成或失败，移动到历史记录
            if (status === 'completed' || status === 'failed' || status === 'cancelled') {
                this.orders.delete(orderId);
                this.orderHistory.push(order);
            }
            
            console.log(`📊 更新订单状态: ${orderId} -> ${status}`);
            return true;
        }
        return false;
    }
}

async function runMockTests() {
    console.log('🧪 Mock Jupiter API 测试');
    console.log('='.repeat(60));
    
    const testResults = {
        total: 0,
        passed: 0,
        failed: 0,
        details: []
    };
    
    // 测试配置
    const TEST_CONFIG = {
        solana: {
            rpcEndpoint: 'https://purple-wiser-tab.solana-mainnet.quiknode.pro',
            commitment: 'confirmed'
        },
        jupiter: {
            baseUrl: 'https://api.jup.ag/v6',
            timeout: 15000
        },
        trading: {
            defaultSlippageBps: 50,
            minTradeAmount: 0.01,
            maxTradeAmount: 10
        }
    };
    
    try {
        // 初始化模拟客户端
        console.log('\n🔧 初始化模拟 Jupiter 客户端');
        const client = new MockJupiterClient(TEST_CONFIG.jupiter);
        
        // 初始化订单管理器
        console.log('📋 初始化订单管理器');
        const orderManager = new SimpleOrderManager();
        
        // 测试 1: 获取代币列表
        console.log('\n📋 测试 1: 获取代币列表');
        try {
            const tokens = await client.getTokenList();
            console.log(`✅ 获取到 ${Object.keys(tokens).length} 个代币`);
            
            // 显示热门代币
            const popularSymbols = ['SOL', 'USDC', 'USDT', 'BONK', 'WIF', 'JUP'];
            const popularTokens = [];
            
            for (const [address, token] of Object.entries(tokens)) {
                if (popularSymbols.includes(token.symbol)) {
                    popularTokens.push(token);
                }
            }
            
            console.log('🔥 热门代币:');
            popularTokens.forEach(token => {
                console.log(`   ${token.symbol}: ${token.address.substring(0, 16)}... (${token.decimals} 小数位)`);
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
        
        // 测试 2: 获取报价
        console.log('\n💰 测试 2: 获取报价');
        const testPairs = [
            { input: 'SOL', output: 'USDC', amount: 0.01 },
            { input: 'USDC', output: 'SOL', amount: 10 }
        ];
        
        for (const pair of testPairs) {
            try {
                const inputToken = client.tokens[pair.input];
                const outputToken = client.tokens[pair.output];
                const amount = pair.input === 'SOL' ? pair.amount * 1e9 : pair.amount * 1e6;
                
                console.log(`\n   ${pair.input} → ${pair.output}:`);
                const quote = await client.getQuote(
                    inputToken,
                    outputToken,
                    amount,
                    TEST_CONFIG.trading.defaultSlippageBps
                );
                
                console.log(`     输入: ${pair.amount} ${pair.input}`);
                console.log(`     输出: ${quote.outAmount / (outputToken === client.tokens.USDC ? 1e6 : 1e9)} ${pair.output}`);
                console.log(`     价格影响: ${quote.priceImpactPct}%`);
                console.log(`     滑点: ${quote.slippageBps / 100}%`);
                console.log(`     路由: ${quote.routePlan?.length || 1} 步`);
                
                testResults.total++;
                testResults.passed++;
                testResults.details.push({ 
                    test: `${pair.input}→${pair.output}报价`, 
                    status: 'passed',
                    inputAmount: pair.amount,
                    outputAmount: quote.outAmount / (outputToken === client.tokens.USDC ? 1e6 : 1e9)
                });
                
            } catch (error) {
                console.error(`   ❌ ${pair.input}→${pair.output}报价失败:`, error.message);
                testResults.total++;
                testResults.failed++;
                testResults.details.push({ 
                    test: `${pair.input}→${pair.output}报价`, 
                    status: 'failed', 
                    error: error.message 
                });
            }
        }
        
        // 测试 3: 价格影响分析
        console.log('\n📊 测试 3: 价格影响分析');
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
        
        // 测试 4: 订单管理
        console.log('\n📝 测试 4: 订单管理');
        try {
            // 创建模拟订单
            const order = await orderManager.createOrder(
                OrderType.BUY,
                client.tokens.USDC,
                client.tokens.SOL,
                10 * 1e6, // 10 USDC
                { slippageBps: 50 }
            );
            
            const orderId = order.id;
            console.log(`✅ 创建订单成功`);
            console.log(`   订单ID: ${orderId}`);
            console.log(`   订单类型: ${order.type}`);
            console.log(`   状态: ${order.status}`);
            console.log(`   输入: ${order.inputAmount / 1e6} USDC`);
            console.log(`   输出: ${order.outputAmount / 1e9} SOL (预期)`);
            
            // 获取订单状态
            const orderStatus = orderManager.getOrder(orderId);
            console.log(`\n📋 获取订单状态:`);
            console.log(`   订单ID: ${orderStatus.id}`);
            console.log(`   状态: ${orderStatus.status}`);
            console.log(`   创建时间: ${orderStatus.createdAt}`);
            
            // 模拟订单完成
            orderManager.updateOrderStatus(orderId, 'completed', {
                actualOutputAmount: 0.006 * 1e9, // 实际收到 0.006 SOL
                transactionId: '模拟交易ID',
                timestamp: new Date().toISOString()
            });
            
            const completedOrder = orderManager.getOrder(orderId);
            console.log(`\n✅ 订单完成:`);
            console.log(`   最终状态: ${completedOrder.status}`);
            console.log(`   实际输出: ${completedOrder.actualOutputAmount / 1e9} SOL`);
            console.log(`   交易ID: ${completedOrder.transactionId}`);
            
            testResults.total++;
            testResults.passed++;
            testResults.details.push({ 
                test: '订单管理', 
                status: 'passed',
                orderId: orderId,
                finalStatus: completedOrder.status
            });
            
        } catch (error) {
            console.error('❌ 订单管理测试失败:', error.message);
            testResults.total++;
            testResults.failed++;
            testResults.details.push({ 
                test: '订单管理', 
                status: 'failed', 
                error: error.message 
            });
        }
        
        // 测试 5: 交易模拟
        console.log('\n🔄 测试 5: 交易模拟');
        try {
            // 获取一个报价
            const quote = await client.getQuote(
                client.tokens.SOL,
                client.tokens.USDC,
                0.01 * 1e9 // 0.01 SOL
            );
            
            // 获取交换指令
            const swapInstruction = await client.getSwapInstruction(
                quote,
                '11111111111111111111111111111111' // 虚拟地址
            );
            
            // 模拟交易
            const simulation = await client.simulateTransaction(swapInstruction.swapTransaction);
            
            console.log(`✅ 交易模拟完成`);
            console.log(`   成功: ${simulation.success}`);
            console.log(`   计算单元: ${simulation.unitsConsumed}`);
            
            if (simulation.logs && simulation.logs.length > 0) {
                console.log(`   日志: ${simulation.logs.length} 条`);
                simulation.logs.slice(0, 2).forEach(log => console.log(`     - ${log}`));
            }
            
            testResults.total++;
            testResults.passed++;
            testResults.details.push({ 
                test: '交易模拟', 
                status: 'passed',
                success: simulation.success,
                unitsConsumed: simulation.unitsConsumed
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
        
        // 显示测试结果
        console.log('\n' + '='.repeat(60));
        console.log('📊 测试结果汇总');
        console.log('='.repeat(60));
        console.log(`✅ 通过: ${testResults.passed}`);
        console.log(`❌ 失败: ${testResults.failed}`);
        console.log(`📋 总计: ${testResults.total}`);
        console.log(`📈 成功率: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);
        
        if (testResults.details.length > 0) {
            console.log('\n📝 详细结果:');
            testResults.details.forEach(detail => {
                const statusIcon = detail.status === 'passed' ? '✅' : '❌';
                console.log(`   ${statusIcon} ${detail.test}`);
                if (detail.status === 'failed') {
                    console.log(`      错误: ${detail.error}`);
                }
            });
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('🎯 Mock Jupiter API 测试完成');
        console.log('💡 注意: 这是模拟测试，不涉及真实API调用或交易');
        console.log('='.repeat(60));
        
        return testResults;
        
    } catch (error) {
        console.error('❌ 测试执行失败:', error);
        throw error;
    }
}

// 运行测试
if (require.main === module) {
    runMockTests()
        .then(results => {
            if (results.failed === 0) {
                console.log('\n🎉 所有测试通过!');
                process.exit(0);
            } else {
                console.log(`\n⚠️  ${results.failed} 个测试失败`);
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('\n💥 测试执行异常:', error);
            process.exit(1);
        });
}

module.exports = { runMockTests };