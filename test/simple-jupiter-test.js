#!/usr/bin/env node

/**
 * 简单Jupiter API测试
 * 测试修复后的端点和OrderManager
 */

const fs = require('fs');
const path = require('path');

async function testJupiterClient() {
    console.log('🧪 测试JupiterClient...');
    
    try {
        // 加载配置
        const configPath = path.join(__dirname, '../config/jupiter-config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        console.log('配置加载成功:');
        console.log(`  Base URL: ${config.baseUrl}`);
        console.log(`  Metis API: ${config.metisApi.baseUrl}`);
        console.log(`  Tokens API: ${config.tokensApi.baseUrl}`);
        
        // 测试JupiterClient
        const JupiterClient = require('../src/trading/jupiter-client');
        
        // 创建客户端
        const client = new JupiterClient({
            jupiter: config,
            rpc: { endpoint: 'https://purple-wiser-tab.solana-mainnet.quiknode.pro' }
        });
        
        console.log('✅ JupiterClient创建成功');
        console.log(`  端点配置:`, client.endpoints);
        
        // 测试getQuote
        console.log('\n🧪 测试getQuote...');
        try {
            const quote = await client.getQuote(
                'So11111111111111111111111111111111111111112', // SOL
                'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
                '1000000000', // 1 SOL (9 decimals)
                50 // 0.5% slippage
            );
            
            console.log('✅ getQuote成功!');
            console.log(`  报价ID: ${quote.quoteId || 'N/A'}`);
            console.log(`  输入: ${quote.inAmount} lamports`);
            console.log(`  输出: ${quote.outAmount} USDC`);
            console.log(`  价格: 1 SOL = ${(quote.outAmount / quote.inAmount).toFixed(6)} USDC`);
            console.log(`  响应时间: ${quote.responseTime}ms`);
            
            return { success: true, quote };
            
        } catch (quoteError) {
            console.log('❌ getQuote失败:', quoteError.message);
            if (quoteError.response) {
                console.log(`  HTTP状态: ${quoteError.response.status}`);
                console.log(`  响应数据:`, quoteError.response.data);
            }
            return { success: false, error: quoteError.message };
        }
        
    } catch (error) {
        console.log('❌ JupiterClient测试失败:', error.message);
        console.log(error.stack);
        return { success: false, error: error.message };
    }
}

async function testOrderManager() {
    console.log('\n📦 测试OrderManager...');
    
    try {
        // 加载配置
        const configPath = path.join(__dirname, '../config/jupiter-config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        const OrderManager = require('../src/trading/order-manager').OrderManager;
        
        // 创建OrderManager
        const manager = new OrderManager({
            jupiter: config,
            rpc: { endpoint: 'https://purple-wiser-tab.solana-mainnet.quiknode.pro' }
        });
        
        console.log('✅ OrderManager创建成功');
        
        // 测试createOrder
        console.log('\n🧪 测试createOrder...');
        try {
            const order = await manager.createOrder(
                'buy', // 确保这是字符串
                'So11111111111111111111111111111111111111112', // SOL
                'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
                '1000000000', // 1 SOL
                { slippageBps: 50 }
            );
            
            console.log('✅ createOrder成功!');
            console.log(`  订单ID: ${order.id}`);
            console.log(`  订单类型: ${order.type}`);
            console.log(`  订单状态: ${order.status}`);
            
            // 测试getOrder
            console.log('\n🧪 测试getOrder...');
            const retrievedOrder = manager.getOrder(order.id);
            if (retrievedOrder) {
                console.log('✅ getOrder成功!');
                console.log(`  检索到的订单ID: ${retrievedOrder.id}`);
            } else {
                console.log('❌ getOrder失败: 订单未找到');
            }
            
            return { success: true, order };
            
        } catch (orderError) {
            console.log('❌ createOrder失败:', orderError.message);
            console.log(orderError.stack);
            return { success: false, error: orderError.message };
        }
        
    } catch (error) {
        console.log('❌ OrderManager测试失败:', error.message);
        console.log(error.stack);
        return { success: false, error: error.message };
    }
}

async function runTests() {
    console.log('🚀 开始Jupiter API简单测试\n');
    
    const jupiterResult = await testJupiterClient();
    const orderManagerResult = await testOrderManager();
    
    console.log('\n' + '='.repeat(70));
    console.log('📊 测试结果汇总:');
    console.log(`  JupiterClient: ${jupiterResult.success ? '✅ 成功' : '❌ 失败'}`);
    console.log(`  OrderManager: ${orderManagerResult.success ? '✅ 成功' : '❌ 失败'}`);
    
    if (!jupiterResult.success || !orderManagerResult.success) {
        console.log('\n⚠️  需要进一步修复的问题:');
        if (!jupiterResult.success) {
            console.log(`  - JupiterClient: ${jupiterResult.error}`);
        }
        if (!orderManagerResult.success) {
            console.log(`  - OrderManager: ${orderManagerResult.error}`);
        }
        process.exit(1);
    }
    
    console.log('\n🎉 所有测试通过! Jupiter API集成修复完成。');
}

runTests().catch(error => {
    console.error('❌ 测试过程中出现严重错误:', error);
    console.error(error.stack);
    process.exit(1);
});