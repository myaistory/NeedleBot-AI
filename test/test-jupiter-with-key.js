#!/usr/bin/env node
/**
 * Jupiter API 测试脚本（带API密钥）
 * 
 * 测试 Jupiter API 集成，需要有效的 API 密钥
 * 获取免费密钥：https://portal.jup.ag
 */

const fs = require('fs');
const path = require('path');

// 加载配置
const configPath = path.join(__dirname, '../config/jupiter-config.json');
let config = {};
try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log('📋 加载 Jupiter 配置:', configPath);
} catch (error) {
    console.error('❌ 无法加载 Jupiter 配置:', error.message);
    console.log('💡 请先创建配置文件: config/jupiter-config.json');
    console.log('💡 获取免费 API 密钥: https://portal.jup.ag');
    process.exit(1);
}

// 检查 API 密钥
if (!config.apiKey || config.apiKey.trim() === '') {
    console.error('❌ 未配置 Jupiter API 密钥');
    console.log('💡 请访问 https://portal.jup.ag 获取免费 API 密钥');
    console.log('💡 然后将密钥添加到 config/jupiter-config.json 文件中的 "apiKey" 字段');
    process.exit(1);
}

console.log('🔑 API 密钥状态:', config.apiKey ? '已配置' : '未配置');
console.log('🌐 基础 URL:', config.baseUrl);
console.log('📊 版本:', config.version);

// 创建 JupiterClient 配置
const jupiterConfig = {
    jupiter: {
        baseUrl: `${config.baseUrl}/${config.version}`,
        apiKey: config.apiKey,
        timeout: config.timeoutMs,
        maxRetries: config.retryAttempts,
        retryDelay: config.retryDelayMs
    },
    rpc: {
        endpoint: 'https://purple-wiser-tab.solana-mainnet.quiknode.pro',
        timeout: 5000
    },
    trading: {
        defaultSlippageBps: config.defaultSlippageBps
    }
};

// 测试代币
const testTokens = {
    SOL: 'So11111111111111111111111111111111111111112',
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
};

async function testJupiterAPI() {
    console.log('\n🚀 开始 Jupiter API 测试');
    console.log('='.repeat(50));
    
    try {
        // 动态导入 JupiterClient
        const { JupiterClient } = require('../src/trading/jupiter-client');
        const client = new JupiterClient(jupiterConfig);
        
        console.log('✅ JupiterClient 初始化成功');
        console.log(`📡 RPC 端点: ${client.rpcEndpoint}`);
        console.log(`🔗 API 端点: ${client.baseUrl}`);
        
        // 测试 1: 获取代币列表
        console.log('\n📋 测试 1: 获取代币列表');
        try {
            const tokenList = await client.getTokenList();
            console.log(`✅ 获取到 ${tokenList.length} 个代币`);
            
            // 显示前5个代币
            const sampleTokens = tokenList.slice(0, 5);
            console.log('📊 示例代币:');
            sampleTokens.forEach(token => {
                console.log(`   ${token.symbol} (${token.name}): ${token.address}`);
            });
        } catch (error) {
            console.error('❌ 获取代币列表失败:', error.message);
        }
        
        // 测试 2: 获取报价
        console.log('\n💰 测试 2: 获取报价 (SOL → USDC)');
        try {
            const amount = 1000000000; // 0.01 SOL (9 decimals)
            const quote = await client.getQuote(
                testTokens.SOL,
                testTokens.USDC,
                amount,
                config.defaultSlippageBps
            );
            
            console.log('✅ 报价获取成功');
            console.log(`📊 输入: ${(amount / 1e9).toFixed(4)} SOL`);
            console.log(`📊 输出: ${(quote.outAmount / 1e6).toFixed(4)} USDC`);
            console.log(`📊 价格影响: ${(quote.priceImpact * 100).toFixed(4)}%`);
            console.log(`📊 响应时间: ${quote.responseTime}ms`);
            console.log(`🛣️  路径: ${quote.routePath}`);
            
            // 分析价格影响
            const analysis = await client.analyzePriceImpact(quote.priceImpact);
            console.log(`📈 价格影响分析: ${analysis.severity} (${analysis.recommendation})`);
            
        } catch (error) {
            console.error('❌ 报价获取失败:', error.message);
            console.error('详细错误:', error.response?.data || error.message);
        }
        
        // 测试 3: 测试连接性
        console.log('\n🔗 测试 3: API 连接性测试');
        try {
            // 使用简单的价格查询测试连接
            const axios = require('axios');
            const testUrl = `${config.baseUrl}/${config.version}/price/v3?ids=${testTokens.SOL}`;
            
            const response = await axios.get(testUrl, {
                timeout: 5000,
                headers: {
                    'Accept': 'application/json',
                    'x-api-key': config.apiKey
                }
            });
            
            console.log('✅ API 连接成功');
            console.log(`📊 状态码: ${response.status}`);
            console.log(`📊 响应大小: ${JSON.stringify(response.data).length} 字节`);
            
            if (response.data.data && response.data.data[testTokens.SOL]) {
                const price = response.data.data[testTokens.SOL].price;
                console.log(`💰 SOL 价格: $${price}`);
            }
            
        } catch (error) {
            console.error('❌ API 连接测试失败:', error.message);
            if (error.response) {
                console.error(`📊 状态码: ${error.response.status}`);
                console.error(`📊 响应: ${JSON.stringify(error.response.data)}`);
            }
        }
        
        console.log('\n' + '='.repeat(50));
        console.log('🎯 Jupiter API 测试完成');
        
    } catch (error) {
        console.error('❌ 测试过程中发生错误:', error.message);
        console.error('堆栈:', error.stack);
    }
}

// 运行测试
testJupiterAPI().catch(error => {
    console.error('❌ 测试脚本执行失败:', error);
    process.exit(1);
});