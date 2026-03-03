#!/usr/bin/env node
/**
 * Jupiter API 正确端点测试
 * 
 * 根据官方文档测试正确的Jupiter API端点
 */

const axios = require('axios');

const API_KEY = 'ddc333e0-5736-43c0-b0fb-5ba6c8823e5e';
const BASE_URL = 'https://api.jup.ag';

// 测试代币
const SOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

async function testCorrectEndpoints() {
    console.log('🎯 Jupiter API 正确端点测试');
    console.log('='.repeat(70));
    
    // 根据官方文档测试端点
    const endpoints = [
        {
            name: '代币列表 (正确端点)',
            url: `${BASE_URL}/tokens`,
            method: 'GET',
            description: '获取所有支持的代币列表'
        },
        {
            name: '价格信息 (正确端点)',
            url: `${BASE_URL}/price`,
            method: 'GET',
            params: { ids: `${SOL},${USDC}` },
            description: '获取代币价格信息'
        },
        {
            name: '报价 (正确端点)',
            url: `${BASE_URL}/quote`,
            method: 'GET',
            params: {
                inputMint: SOL,
                outputMint: USDC,
                amount: 1000000000, // 1 SOL
                slippageBps: 50
            },
            description: '获取交易报价'
        },
        {
            name: 'Swap指令',
            url: `${BASE_URL}/swap`,
            method: 'POST',
            data: {
                quoteResponse: {}, // 需要先获取quote
                userPublicKey: '11111111111111111111111111111111', // 测试公钥
                wrapAndUnwrapSol: true
            },
            description: '生成交换指令'
        },
        {
            name: 'Ultra API',
            url: `${BASE_URL}/ultra`,
            method: 'GET',
            description: 'Ultra API端点'
        }
    ];
    
    const headers = {
        'x-api-key': API_KEY,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'NeedleBot-AI/1.0'
    };
    
    let quoteResponse = null;
    
    for (const endpoint of endpoints) {
        console.log(`\n📡 测试: ${endpoint.name}`);
        console.log(`   ${endpoint.description}`);
        console.log(`   URL: ${endpoint.url}`);
        
        try {
            const config = {
                method: endpoint.method,
                url: endpoint.url,
                headers: headers,
                timeout: 15000
            };
            
            if (endpoint.params) {
                config.params = endpoint.params;
            }
            
            // 对于POST请求，需要先获取quote
            if (endpoint.name === 'Swap指令') {
                if (!quoteResponse) {
                    console.log('   ⏳ 需要先获取报价...');
                    // 先获取报价
                    const quoteConfig = {
                        method: 'GET',
                        url: `${BASE_URL}/quote`,
                        headers: headers,
                        params: {
                            inputMint: SOL,
                            outputMint: USDC,
                            amount: 1000000000,
                            slippageBps: 50
                        },
                        timeout: 10000
                    };
                    
                    try {
                        const quoteResult = await axios(quoteConfig);
                        quoteResponse = quoteResult.data;
                        console.log('   ✅ 报价获取成功');
                    } catch (quoteError) {
                        console.log(`   ❌ 报价获取失败: ${quoteError.message}`);
                        continue;
                    }
                }
                
                config.data = {
                    quoteResponse: quoteResponse,
                    userPublicKey: '11111111111111111111111111111111',
                    wrapAndUnwrapSol: true
                };
            }
            
            const response = await axios(config);
            
            console.log(`   ✅ 成功: ${response.status} ${response.statusText}`);
            
            // 显示有用的信息
            if (endpoint.name.includes('代币列表') && response.data) {
                console.log(`      代币数量: ${response.data.length || '未知'}`);
                if (Array.isArray(response.data) && response.data.length > 0) {
                    console.log(`      示例: ${response.data[0].symbol || '未知'} (${response.data[0].address || '未知'})`);
                }
            }
            
            if (endpoint.name.includes('价格信息') && response.data) {
                const data = response.data.data || response.data;
                if (data && data[SOL]) {
                    console.log(`      SOL价格: $${data[SOL].price?.toFixed(4) || 'N/A'}`);
                }
                if (data && data[USDC]) {
                    console.log(`      USDC价格: $${data[USDC].price?.toFixed(4) || 'N/A'}`);
                }
            }
            
            if (endpoint.name.includes('报价') && response.data) {
                console.log(`      输入: 1 SOL`);
                console.log(`      输出: ${response.data.outAmount / 1e6} USDC`);
                console.log(`      价格: ${(response.data.outAmount / 1000000000 * 1e3).toFixed(4)} USDC/SOL`);
                if (response.data.routePlan) {
                    console.log(`      路径步数: ${response.data.routePlan.length}`);
                }
            }
            
            if (endpoint.name.includes('Swap指令') && response.data) {
                console.log(`      交易指令生成成功`);
                if (response.data.swapTransaction) {
                    console.log(`      交易大小: ${response.data.swapTransaction.length} bytes`);
                }
            }
            
            if (endpoint.name.includes('Ultra API') && response.data) {
                console.log(`      Ultra API可用`);
            }
            
        } catch (error) {
            console.log(`   ❌ 错误: ${error.message}`);
            
            if (error.response) {
                console.log(`      状态码: ${error.response.status}`);
                console.log(`      状态文本: ${error.response.statusText}`);
                
                if (error.response.data) {
                    const errorData = typeof error.response.data === 'string' 
                        ? error.response.data 
                        : JSON.stringify(error.response.data, null, 2);
                    console.log(`      响应: ${errorData.substring(0, 300)}${errorData.length > 300 ? '...' : ''}`);
                }
            }
            
            if (error.code) {
                console.log(`      错误代码: ${error.code}`);
            }
        }
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('🎉 端点测试完成');
    
    // 额外测试：检查API密钥权限
    console.log('\n🔑 API密钥权限测试');
    console.log('-'.repeat(40));
    
    try {
        // 测试不带API密钥的请求
        const noKeyResponse = await axios.get(`${BASE_URL}/price`, {
            params: { ids: SOL },
            timeout: 5000
        });
        console.log('✅ 不带API密钥的价格请求成功');
    } catch (noKeyError) {
        console.log(`❌ 不带API密钥的请求失败: ${noKeyError.message}`);
    }
    
    try {
        // 测试带错误API密钥的请求
        const wrongKeyResponse = await axios.get(`${BASE_URL}/price`, {
            params: { ids: SOL },
            headers: { 'x-api-key': 'wrong-key-12345' },
            timeout: 5000
        });
        console.log('✅ 带错误API密钥的价格请求成功（可能不需要认证）');
    } catch (wrongKeyError) {
        console.log(`❌ 带错误API密钥的请求失败: ${wrongKeyError.message}`);
        if (wrongKeyError.response?.status === 401) {
            console.log('   🔒 需要有效的API密钥认证');
        }
    }
}

// 运行测试
testCorrectEndpoints().catch(error => {
    console.error('💥 测试执行失败:', error);
    process.exit(1);
});