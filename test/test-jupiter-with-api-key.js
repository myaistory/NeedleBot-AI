#!/usr/bin/env node
/**
 * Jupiter API 带密钥测试脚本
 * 
 * 使用提供的API密钥测试Jupiter API连接和功能
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// 加载配置
const configPath = path.join(__dirname, '../config/jupiter-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

console.log('🔑 Jupiter API 密钥测试');
console.log('='.repeat(50));
console.log(`API密钥: ${config.apiKey ? '已配置' : '未配置'}`);
console.log(`基础URL: ${config.baseUrl}`);
console.log(`版本: ${config.version}`);

// 测试代币
const SOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// 测试函数
async function testAPI() {
    console.log('\n🚀 开始API测试...');
    
    // 1. 测试基本连接
    console.log('\n1️⃣ 测试基本连接...');
    try {
        const healthResponse = await axios.get(`${config.baseUrl}/health`, {
            headers: {
                'x-api-key': config.apiKey
            },
            timeout: 5000
        });
        console.log(`✅ 健康检查: ${healthResponse.status} ${healthResponse.statusText}`);
    } catch (error) {
        console.log(`⚠️  健康检查失败: ${error.message}`);
    }
    
    // 2. 测试报价端点
    console.log('\n2️⃣ 测试报价端点...');
    try {
        const quoteParams = {
            inputMint: SOL,
            outputMint: USDC,
            amount: 1000000000, // 1 SOL (9 decimals)
            slippageBps: config.defaultSlippageBps
        };
        
        const quoteResponse = await axios.get(`${config.baseUrl}/${config.version}/quote`, {
            params: quoteParams,
            headers: {
                'x-api-key': config.apiKey,
                'Accept': 'application/json'
            },
            timeout: 10000
        });
        
        console.log(`✅ 报价请求成功: ${quoteResponse.status}`);
        console.log(`   输入: ${quoteParams.amount / 1e9} SOL`);
        console.log(`   输出: ${quoteResponse.data.outAmount / 1e6} USDC`);
        console.log(`   价格: ${(quoteResponse.data.outAmount / quoteParams.amount * 1e3).toFixed(4)} USDC/SOL`);
        
        if (quoteResponse.data.routePlan) {
            console.log(`   路径: ${quoteResponse.data.routePlan.length} 步`);
        }
        
    } catch (error) {
        console.error(`❌ 报价请求失败: ${error.message}`);
        if (error.response) {
            console.error(`   状态码: ${error.response.status}`);
            console.error(`   响应: ${JSON.stringify(error.response.data, null, 2)}`);
        }
    }
    
    // 3. 测试代币列表
    console.log('\n3️⃣ 测试代币列表...');
    try {
        const tokensResponse = await axios.get(`${config.baseUrl}/tokens/v2`, {
            headers: {
                'x-api-key': config.apiKey
            },
            timeout: 10000
        });
        
        console.log(`✅ 代币列表获取成功: ${tokensResponse.status}`);
        console.log(`   代币数量: ${tokensResponse.data.length}`);
        
        // 显示前5个代币
        console.log('   前5个代币:');
        tokensResponse.data.slice(0, 5).forEach((token, index) => {
            console.log(`     ${index + 1}. ${token.symbol} (${token.address})`);
        });
        
    } catch (error) {
        console.error(`❌ 代币列表获取失败: ${error.message}`);
        if (error.response) {
            console.error(`   状态码: ${error.response.status}`);
        }
    }
    
    // 4. 测试价格端点
    console.log('\n4️⃣ 测试价格端点...');
    try {
        const priceParams = {
            ids: `${SOL},${USDC}`
        };
        
        const priceResponse = await axios.get(`${config.baseUrl}/price/v3`, {
            params: priceParams,
            headers: {
                'x-api-key': config.apiKey
            },
            timeout: 10000
        });
        
        console.log(`✅ 价格获取成功: ${priceResponse.status}`);
        
        if (priceResponse.data.data) {
            const solPrice = priceResponse.data.data[SOL]?.price;
            const usdcPrice = priceResponse.data.data[USDC]?.price;
            
            if (solPrice) {
                console.log(`   SOL价格: $${solPrice.toFixed(4)}`);
            }
            if (usdcPrice) {
                console.log(`   USDC价格: $${usdcPrice.toFixed(4)}`);
            }
        }
        
    } catch (error) {
        console.error(`❌ 价格获取失败: ${error.message}`);
    }
    
    // 5. 测试Ultra API
    console.log('\n5️⃣ 测试Ultra API...');
    if (config.ultraApi?.enabled) {
        try {
            const ultraResponse = await axios.get(`${config.ultraApi.baseUrl}/health`, {
                headers: {
                    'x-api-key': config.apiKey
                },
                timeout: 5000
            });
            
            console.log(`✅ Ultra API健康检查: ${ultraResponse.status}`);
            
        } catch (error) {
            console.log(`⚠️  Ultra API健康检查失败: ${error.message}`);
        }
    } else {
        console.log('ℹ️  Ultra API未启用');
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('🎉 API测试完成！');
}

// 运行测试
testAPI().catch(error => {
    console.error('💥 测试执行失败:', error);
    process.exit(1);
});