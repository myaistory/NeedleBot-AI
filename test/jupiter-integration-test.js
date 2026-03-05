#!/usr/bin/env node
/**
 * Jupiter API 集成测试脚本
 * 
 * 完整的 Jupiter API 集成测试，包括：
 * 1. 配置验证
 * 2. API 连接测试
 * 3. 功能测试（只读）
 * 4. 错误处理测试
 */

const fs = require('fs');
const path = require('path');
const { JupiterClient } = require('../src/trading/jupiter-client');
const { OrderManager, OrderType } = require('../src/trading/order-manager');

// 加载配置
const configPath = path.join(__dirname, '../config/jupiter-config.json');
let config = {};

console.log('🚀 Jupiter API 集成测试');
console.log('='.repeat(60));

try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log('✅ 配置加载成功:', configPath);
} catch (error) {
    console.error('❌ 无法加载配置:', error.message);
    console.log('💡 请先创建配置文件: config/jupiter-config.json');
    console.log('💡 模板:');
    console.log(JSON.stringify({
        apiKey: "您的API密钥",
        baseUrl: "https://api.jup.ag",
        version: "v6",
        defaultSlippageBps: 50
    }, null, 2));
    console.log('📖 详细指南: docs/JUPITER_API_KEY_GUIDE.md');
    process.exit(1);
}

// 检查 API 密钥
if (!config.apiKey || config.apiKey.trim() === '') {
    console.error('⚠️  未配置 Jupiter API 密钥');
    console.log('💡 请访问 https://portal.jup.ag 获取免费 API 密钥');
    console.log('📖 详细指南: docs/JUPITER_API_KEY_GUIDE.md');
    console.log('\n🔍 运行无密钥的基础连接测试...');
    
    // 运行基础连接测试
    require('./simple-jupiter-test.js');
    process.exit(0);
}

console.log('🔑 API 密钥状态: 已配置');
console.log('🌐 基础 URL:', config.baseUrl);
console.log('📊 版本:', config.version);

// 测试代币
const TEST_TOKENS = {
    SOL: 'So11111111111111111111111111111111111111112',
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm'
};

// 测试配置
const TEST_CONFIG = {
    rpc: {
        endpoint: 'https://purple-wiser-tab.solana-mainnet.quiknode.pro',
        timeout: 10000
    },
    jupiter: {
        baseUrl: `${config.baseUrl}/${config.version}`,
        apiKey: config.apiKey,
        timeout: config.timeoutMs || 15000,
        maxRetries: config.retryAttempts || 3,
        retryDelay: config.retryDelayMs || 1000
    },
    trading: {
        defaultSlippageBps: config.defaultSlippageBps || 50
    }
};

async function runTests() {
    let allTestsPassed = true;
    const testResults = [];
    
    console.log('\n🧪 开始集成测试');
    console.log('-'.repeat(60));
    
    try {
        // 测试 1: 初始化客户端
        console.log('\n1️⃣  测试 1: 初始化 JupiterClient');
        let client;
        try {
            client = new JupiterClient(TEST_CONFIG);
            console.log('✅ JupiterClient 初始化成功');
            console.log(`   📡 RPC: ${client.rpcEndpoint}`);
            console.log(`   🔗 API: ${client.baseUrl}`);
            testResults.push({ test: '初始化', status: '✅', details: '成功' });
        } catch (error) {
            console.error('❌ JupiterClient 初始化失败:', error.message);
            testResults.push({ test: '初始化', status: '❌', details: error.message });
            allTestsPassed = false;
            return;
        }
        
        // 测试 2: 获取代币列表
        console.log('\n2️⃣  测试 2: 获取代币列表');
        try {
            const tokenList = await client.getTokenList();
            console.log(`✅ 获取到 ${tokenList.length} 个代币`);
            
            // 验证常见代币存在
            const foundTokens = [];
            for (const [symbol, address] of Object.entries(TEST_TOKENS)) {
                const token = tokenList.find(t => t.address === address);
                if (token) {
                    foundTokens.push(`${symbol} (${token.symbol})`);
                }
            }
            
            console.log(`   📊 找到 ${foundTokens.length} 个测试代币: ${foundTokens.join(', ')}`);
            testResults.push({ 
                test: '代币列表', 
                status: '✅', 
                details: `${tokenList.length} 个代币，找到 ${foundTokens.length} 个测试代币` 
            });
            
        } catch (error) {
            console.error('❌ 获取代币列表失败:', error.message);
            testResults.push({ test: '代币列表', status: '❌', details: error.message });
            allTestsPassed = false;
        }
        
        // 测试 3: 获取报价
        console.log('\n3️⃣  测试 3: 获取报价 (SOL → USDC)');
        try {
            const amount = 1000000000; // 0.01 SOL
            const quote = await client.getQuote(
                TEST_TOKENS.SOL,
                TEST_TOKENS.USDC,
                amount,
                TEST_CONFIG.trading.defaultSlippageBps
            );
            
            console.log('✅ 报价获取成功');
            console.log(`   💰 输入: ${(amount / 1e9).toFixed(4)} SOL`);
            console.log(`   💰 输出: ${(quote.outAmount / 1e6).toFixed(4)} USDC`);
            console.log(`   📊 价格影响: ${(quote.priceImpact * 100).toFixed(4)}%`);
            console.log(`   ⚡ 响应时间: ${quote.responseTime}ms`);
            
            // 分析价格影响
            const analysis = await client.analyzePriceImpact(quote.priceImpact);
            console.log(`   📈 分析: ${analysis.severity} - ${analysis.recommendation}`);
            
            testResults.push({ 
                test: '获取报价', 
                status: '✅', 
                details: `${(amount / 1e9).toFixed(4)} SOL → ${(quote.outAmount / 1e6).toFixed(4)} USDC` 
            });
            
        } catch (error) {
            console.error('❌ 获取报价失败:', error.message);
            if (error.response) {
                console.error(`   📊 状态码: ${error.response.status}`);
                console.error(`   📊 响应: ${JSON.stringify(error.response.data)}`);
            }
            testResults.push({ test: '获取报价', status: '❌', details: error.message });
            allTestsPassed = false;
        }
        
        // 测试 4: 初始化 OrderManager
        console.log('\n4️⃣  测试 4: 初始化 OrderManager');
        let orderManager;
        try {
            orderManager = new OrderManager(TEST_CONFIG);
            console.log('✅ OrderManager 初始化成功');
            testResults.push({ test: 'OrderManager', status: '✅', details: '成功' });
        } catch (error) {
            console.error('❌ OrderManager 初始化失败:', error.message);
            testResults.push({ test: 'OrderManager', status: '❌', details: error.message });
            allTestsPassed = false;
        }
        
        // 测试 5: 创建模拟订单
        if (orderManager) {
            console.log('\n5️⃣  测试 5: 创建模拟订单');
            try {
                const mockOrder = {
                    tokenPair: 'SOL/USDC',
                    amount: '0.01',
                    price: '100.50',
                    type: OrderType.LIMIT_BUY,
                    status: 'pending'
                };
                
                const orderId = await orderManager.createOrder(mockOrder);
                console.log(`✅ 模拟订单创建成功: ${orderId}`);
                
                // 获取订单状态
                const orderStatus = await orderManager.getOrder(orderId);
                console.log(`   📊 订单状态: ${orderStatus.status}`);
                
                testResults.push({ 
                    test: '创建订单', 
                    status: '✅', 
                    details: `订单ID: ${orderId}` 
                });
                
            } catch (error) {
                console.error('❌ 创建订单失败:', error.message);
                testResults.push({ test: '创建订单', status: '❌', details: error.message });
                allTestsPassed = false;
            }
        }
        
        // 测试 6: 错误处理
        console.log('\n6️⃣  测试 6: 错误处理验证');
        try {
            // 测试无效的代币地址
            await client.getQuote(
                'INVALID_TOKEN_ADDRESS',
                TEST_TOKENS.USDC,
                1000000000,
                50
            );
            console.error('❌ 预期错误但未抛出');
            testResults.push({ test: '错误处理', status: '❌', details: '未捕获无效代币错误' });
            allTestsPassed = false;
        } catch (error) {
            console.log('✅ 错误处理正常:', error.message);
            testResults.push({ test: '错误处理', status: '✅', details: '成功捕获错误' });
        }
        
    } catch (error) {
        console.error('❌ 测试过程中发生未预期错误:', error);
        testResults.push({ test: '整体测试', status: '❌', details: error.message });
        allTestsPassed = false;
    }
    
    // 输出测试总结
    console.log('\n' + '='.repeat(60));
    console.log('📊 测试结果总结');
    console.log('='.repeat(60));
    
    testResults.forEach(result => {
        console.log(`${result.status} ${result.test}: ${result.details}`);
    });
    
    console.log('\n' + '='.repeat(60));
    if (allTestsPassed) {
        console.log('🎉 所有测试通过！Jupiter API 集成成功！');
        console.log('\n🚀 下一步:');
        console.log('   1. 可以开始真实交易测试');
        console.log('   2. 集成到 NeedleBot 主系统');
        console.log('   3. 配置风险管理参数');
    } else {
        console.log('⚠️  部分测试失败，需要修复');
        console.log('\n🔧 建议:');
        console.log('   1. 检查 API 密钥有效性');
        console.log('   2. 验证网络连接');
        console.log('   3. 查看详细错误日志');
        console.log('   4. 参考 docs/JUPITER_API_KEY_GUIDE.md');
    }
    console.log('='.repeat(60));
}

// 运行测试
runTests().catch(error => {
    console.error('❌ 测试脚本执行失败:', error);
    process.exit(1);
});