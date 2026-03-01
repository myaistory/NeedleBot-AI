#!/usr/bin/env node
/**
 * Jupiter API 集成测试
 * 
 * 测试 JupiterClient 和 OrderManager 的功能
 */

const JupiterClient = require('../src/trading/jupiter-client');
const { OrderManager, OrderType } = require('../src/trading/order-manager');

// 测试结果统计
const testResults = {
    total: 0,
    passed: 0,
    failed: 0,
    tests: []
};

function test(name, fn) {
    testResults.total++;
    console.log(`\n🧪 测试：${name}`);
    
    return fn()
        .then(() => {
            testResults.passed++;
            testResults.tests.push({ name, status: 'passed' });
            console.log(`✅ 通过：${name}`);
        })
        .catch(error => {
            testResults.failed++;
            testResults.tests.push({ name, status: 'failed', error: error.message });
            console.error(`❌ 失败：${name}`);
            console.error(`   错误：${error.message}`);
        });
}

async function runTests() {
    console.log('🚀 开始 Jupiter API 集成测试');
    console.log('='.repeat(60));
    
    const client = new JupiterClient();
    
    // 测试 1: 获取 SOL → USDC 报价
    await test('获取 SOL → USDC 报价', async () => {
        const quote = await client.getQuote(
            client.tokens.SOL,
            client.tokens.USDC,
            0.1 * 1e9 // 0.1 SOL
        );
        
        if (!quote.inAmount || !quote.outAmount) {
            throw new Error('报价缺少必要字段');
        }
        
        if (Number(quote.outAmount) <= 0) {
            throw new Error('输出金额无效');
        }
        
        console.log(`   输入：${client._formatAmount(quote.inAmount, client.tokens.SOL)}`);
        console.log(`   输出：${client._formatAmount(quote.outAmount, client.tokens.USDC)}`);
    });
    
    // 测试 2: 获取 USDC → SOL 报价
    await test('获取 USDC → SOL 报价', async () => {
        const quote = await client.getQuote(
            client.tokens.USDC,
            client.tokens.SOL,
            10 * 1e6 // 10 USDC
        );
        
        if (!quote.inAmount || !quote.outAmount) {
            throw new Error('报价缺少必要字段');
        }
    });
    
    // 测试 3: 测试价格影响计算
    await test('价格影响计算', async () => {
        const quote = await client.getQuote(
            client.tokens.SOL,
            client.tokens.USDC,
            1 * 1e9 // 1 SOL
        );
        
        const priceImpact = client._calculatePriceImpact(quote);
        
        if (typeof priceImpact !== 'number') {
            throw new Error('价格影响不是数字');
        }
        
        if (priceImpact < 0 || priceImpact > 1) {
            throw new Error(`价格影响超出范围：${priceImpact}`);
        }
        
        console.log(`   价格影响：${(priceImpact * 100).toFixed(4)}%`);
    });
    
    // 测试 4: 测试滑点验证
    await test('滑点验证', async () => {
        try {
            // 这应该失败，因为滑点超过最大值
            await client.getQuote(
                client.tokens.SOL,
                client.tokens.USDC,
                0.1 * 1e9,
                5000 // 50% 滑点，应该被拒绝
            );
            throw new Error('应该拒绝过大的滑点');
        } catch (error) {
            if (error.message.includes('滑点过大')) {
                console.log('   正确拒绝了过大的滑点');
                return;
            }
            throw error;
        }
    });
    
    // 测试 5: 测试 API 重试机制
    await test('API 重试机制', async () => {
        const startTime = Date.now();
        
        // 使用无效的代币地址测试错误处理
        try {
            await client.getQuote(
                'InvalidTokenAddress',
                client.tokens.USDC,
                0.1 * 1e9
            );
        } catch (error) {
            const duration = Date.now() - startTime;
            console.log(`   错误处理时间：${duration}ms`);
            console.log(`   重试次数配置：${client.maxRetries}`);
        }
    });
    
    // 测试 6: 测试指标统计
    await test('指标统计', async () => {
        const metrics = client.getMetrics();
        
        if (!metrics.totalQuotes) {
            throw new Error('缺少总报价数统计');
        }
        
        if (!metrics.successRate) {
            throw new Error('缺少成功率统计');
        }
        
        console.log(`   总报价数：${metrics.totalQuotes}`);
        console.log(`   成功：${metrics.successfulQuotes}`);
        console.log(`   失败：${metrics.failedQuotes}`);
        console.log(`   成功率：${metrics.successRate}`);
    });
    
    // 测试 7: 测试订单创建
    await test('订单创建', async () => {
        const manager = new OrderManager();
        
        const order = await manager.createOrder(
            OrderType.BUY,
            client.tokens.SOL,
            client.tokens.USDC,
            0.01 * 1e9, // 0.01 SOL
            { slippageBps: 50 }
        );
        
        if (!order.id) {
            throw new Error('订单缺少 ID');
        }
        
        if (order.status !== 'pending') {
            throw new Error(`订单初始状态错误：${order.status}`);
        }
        
        console.log(`   订单 ID: ${order.id}`);
        console.log(`   初始状态：${order.status}`);
        
        // 等待订单执行
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const finalStatus = manager.getOrderStatus(order.id);
        console.log(`   最终状态：${finalStatus?.status || 'not found'}`);
    });
    
    // 测试 8: 测试订单取消
    await test('订单取消', async () => {
        const manager = new OrderManager();
        
        const order = await manager.createOrder(
            OrderType.BUY,
            client.tokens.SOL,
            client.tokens.USDC,
            0.01 * 1e9,
            { slippageBps: 50 }
        );
        
        // 立即取消
        const cancelledOrder = manager.cancelOrder(order.id);
        
        if (cancelledOrder.status !== 'cancelled') {
            throw new Error(`订单取消后状态错误：${cancelledOrder.status}`);
        }
        
        console.log(`   订单已取消：${order.id}`);
    });
    
    // 测试 9: 测试订单历史
    await test('订单历史', async () => {
        const manager = new OrderManager();
        
        // 创建几个订单
        for (let i = 0; i < 3; i++) {
            await manager.createOrder(
                OrderType.BUY,
                client.tokens.SOL,
                client.tokens.USDC,
                0.01 * 1e9
            );
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        const history = manager.getOrderHistory();
        
        if (history.length < 1) {
            throw new Error('订单历史为空');
        }
        
        console.log(`   历史记录数：${history.length}`);
    });
    
    // 测试 10: 测试统计信息
    await test('统计信息', async () => {
        const manager = new OrderManager();
        
        const stats = manager.getStats();
        
        if (!stats.totalOrders) {
            throw new Error('缺少总订单数统计');
        }
        
        if (!stats.successRate) {
            throw new Error('缺少成功率统计');
        }
        
        console.log('   统计信息:', JSON.stringify(stats, null, 2));
    });
    
    // 显示测试结果
    console.log('\n' + '='.repeat(60));
    console.log('📊 测试结果汇总');
    console.log('='.repeat(60));
    console.log(`总测试数：${testResults.total}`);
    console.log(`✅ 通过：${testResults.passed}`);
    console.log(`❌ 失败：${testResults.failed}`);
    console.log(`成功率：${((testResults.passed / testResults.total) * 100).toFixed(2)}%`);
    
    if (testResults.failed > 0) {
        console.log('\n失败的测试:');
        testResults.tests
            .filter(t => t.status === 'failed')
            .forEach(t => {
                console.log(`  - ${t.name}: ${t.error}`);
            });
    }
    
    // 退出代码
    process.exit(testResults.failed > 0 ? 1 : 0);
}

// 运行测试
runTests().catch(error => {
    console.error('测试运行失败:', error.message);
    process.exit(1);
});
