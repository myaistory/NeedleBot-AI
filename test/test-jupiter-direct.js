#!/usr/bin/env node
/**
 * Jupiter API 直接测试
 * 
 * 直接测试Jupiter API端点，验证API密钥和连接
 */

const axios = require('axios');

const API_KEY = 'ddc333e0-5736-43c0-b0fb-5ba6c8823e5e';
const BASE_URL = 'https://api.jup.ag';

// 测试代币
const SOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

async function testEndpoints() {
    console.log('🔍 Jupiter API 端点测试');
    console.log('='.repeat(60));
    
    const endpoints = [
        {
            name: '健康检查',
            url: `${BASE_URL}/health`,
            method: 'GET',
            expectedStatus: 200
        },
        {
            name: '代币列表 (v2)',
            url: `${BASE_URL}/tokens/v2`,
            method: 'GET',
            expectedStatus: 200
        },
        {
            name: '价格信息 (v3)',
            url: `${BASE_URL}/price/v3`,
            method: 'GET',
            params: { ids: `${SOL},${USDC}` },
            expectedStatus: 200
        },
        {
            name: '报价 (v6)',
            url: `${BASE_URL}/v6/quote`,
            method: 'GET',
            params: {
                inputMint: SOL,
                outputMint: USDC,
                amount: 1000000000, // 1 SOL
                slippageBps: 50
            },
            expectedStatus: 200
        },
        {
            name: 'Ultra API 健康检查',
            url: `${BASE_URL}/ultra/v1/health`,
            method: 'GET',
            expectedStatus: 200
        }
    ];
    
    const headers = {
        'x-api-key': API_KEY,
        'Accept': 'application/json',
        'User-Agent': 'NeedleBot-AI/1.0'
    };
    
    for (const endpoint of endpoints) {
        console.log(`\n📡 测试: ${endpoint.name}`);
        console.log(`   URL: ${endpoint.url}`);
        
        try {
            const config = {
                method: endpoint.method,
                url: endpoint.url,
                headers: headers,
                timeout: 10000
            };
            
            if (endpoint.params) {
                config.params = endpoint.params;
            }
            
            const response = await axios(config);
            
            console.log(`   ✅ 状态: ${response.status} ${response.statusText}`);
            
            // 显示一些有用的信息
            if (endpoint.name.includes('代币列表') && response.data) {
                console.log(`      代币数量: ${response.data.length}`);
                if (response.data.length > 0) {
                    console.log(`      示例: ${response.data[0].symbol} (${response.data[0].address})`);
                }
            }
            
            if (endpoint.name.includes('价格信息') && response.data?.data) {
                const solData = response.data.data[SOL];
                const usdcData = response.data.data[USDC];
                if (solData) {
                    console.log(`      SOL价格: $${solData.price?.toFixed(4) || 'N/A'}`);
                }
                if (usdcData) {
                    console.log(`      USDC价格: $${usdcData.price?.toFixed(4) || 'N/A'}`);
                }
            }
            
            if (endpoint.name.includes('报价') && response.data) {
                console.log(`      输入: ${endpoint.params.amount / 1e9} SOL`);
                console.log(`      输出: ${response.data.outAmount / 1e6} USDC`);
                console.log(`      价格: ${(response.data.outAmount / endpoint.params.amount * 1e3).toFixed(4)} USDC/SOL`);
                if (response.data.routePlan) {
                    console.log(`      路径步数: ${response.data.routePlan.length}`);
                }
            }
            
        } catch (error) {
            console.log(`   ❌ 错误: ${error.message}`);
            
            if (error.response) {
                console.log(`      状态码: ${error.response.status}`);
                console.log(`      状态文本: ${error.response.statusText}`);
                
                if (error.response.data) {
                    console.log(`      响应数据: ${JSON.stringify(error.response.data, null, 2).substring(0, 200)}...`);
                }
            }
            
            if (error.code === 'ENOTFOUND') {
                console.log(`      DNS解析失败: ${error.hostname}`);
            }
        }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🎯 端点测试完成');
}

// 运行测试
testEndpoints().catch(error => {
    console.error('💥 测试执行失败:', error);
    process.exit(1);
});