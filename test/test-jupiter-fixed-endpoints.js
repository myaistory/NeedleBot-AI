#!/usr/bin/env node

/**
 * 测试修复后的Jupiter API端点
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

console.log('🔧 测试修复后的Jupiter API端点');
console.log('='.repeat(70));

async function testFixedEndpoints() {
    // 加载配置
    const configPath = path.join(__dirname, '../config/jupiter-config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    console.log('📋 当前配置:');
    console.log(`   Base URL: ${config.baseUrl}`);
    console.log(`   API版本: ${config.version}`);
    console.log(`   API密钥: ${config.apiKey ? '已配置' : '未配置'}`);
    console.log(`   端点:`);
    Object.entries(config.endpoints).forEach(([key, value]) => {
        console.log(`     - ${key}: ${value}`);
    });
    
    // 测试各个端点
    const endpoints = [
        { name: '代币列表', path: config.endpoints.tokens },
        { name: '报价', path: config.endpoints.quote },
        { name: '价格', path: config.endpoints.price }
    ];
    
    for (const endpoint of endpoints) {
        console.log(`\n🌐 测试${endpoint.name}端点: ${endpoint.path}`);
        
        const url = `${config.baseUrl}${endpoint.path}`;
        
        // 对于报价端点，需要添加参数
        if (endpoint.name === '报价') {
            const params = new URLSearchParams({
                inputMint: 'So11111111111111111111111111111111111111112',
                outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                amount: '1000000000',
                slippageBps: '50',
                swapMode: 'ExactIn'
            });
            
            const testUrl = `${url}?${params.toString()}`;
            console.log(`   测试URL: ${testUrl.substring(0, 100)}...`);
            
            try {
                const startTime = Date.now();
                const response = await axios.get(testUrl, {
                    headers: config.headers,
                    timeout: 10000
                });
                const responseTime = Date.now() - startTime;
                
                console.log(`   ✅ 成功: HTTP ${response.status} (${responseTime}ms)`);
                
                if (response.data) {
                    const data = response.data;
                    console.log(`   输入金额: ${data.inAmount} SOL`);
                    console.log(`   输出金额: ${data.outAmount} USDC`);
                    console.log(`   价格: 1 SOL = ${(data.outAmount / data.inAmount).toFixed(6)} USDC`);
                    console.log(`   价格影响: ${data.priceImpactPct || 'N/A'}%`);
                    
                    if (data.routePlan && data.routePlan.length > 0) {
                        console.log(`   路由路径: ${data.routePlan.length} 步`);
                        data.routePlan.forEach((step, index) => {
                            console.log(`     步骤${index + 1}: ${step.swapInfo.label || '未知DEX'}`);
                        });
                    }
                }
                
            } catch (error) {
                console.log(`   ❌ 失败: ${error.message}`);
                if (error.response) {
                    console.log(`   HTTP状态: ${error.response.status}`);
                    if (error.response.data) {
                        console.log(`   错误详情: ${JSON.stringify(error.response.data)}`);
                    }
                }
            }
        } else {
            // 其他端点直接测试
            console.log(`   测试URL: ${url}`);
            
            try {
                const startTime = Date.now();
                const response = await axios.get(url, {
                    headers: config.headers,
                    timeout: 5000
                });
                const responseTime = Date.now() - startTime;
                
                console.log(`   ✅ 成功: HTTP ${response.status} (${responseTime}ms)`);
                
                if (endpoint.name === '代币列表' && response.data && Array.isArray(response.data)) {
                    console.log(`   代币数量: ${response.data.length}`);
                    if (response.data.length > 0) {
                        console.log(`   示例代币: ${response.data[0].symbol || response.data[0].address}`);
                    }
                }
                
            } catch (error) {
                console.log(`   ❌ 失败: ${error.message}`);
                if (error.response) {
                    console.log(`   HTTP状态: ${error.response.status}`);
                }
            }
        }
    }
    
    // 测试JupiterClient集成
    console.log('\n🔧 测试JupiterClient集成');
    try {
        const JupiterClient = require('../src/trading/jupiter-client');
        
        // 创建客户端实例
        const client = new JupiterClient({
            jupiter: config,
            rpc: {
                endpoint: 'https://purple-wiser-tab.solana-mainnet.quiknode.pro'
            }
        });
        
        console.log('   ✅ JupiterClient创建成功');
        console.log(`   客户端Base URL: ${client.baseUrl}`);
        console.log(`   客户端端点: ${JSON.stringify(client.endpoints)}`);
        
        // 测试getQuote方法
        console.log('\n   🧪 测试getQuote方法...');
        try {
            const quote = await client.getQuote(
                'So11111111111111111111111111111111111111112',
                'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                '1000000000',
                50
            );
            
            console.log('   ✅ getQuote方法成功');
            console.log(`   报价ID: ${quote.quoteId || 'N/A'}`);
            console.log(`   输入金额: ${quote.inAmount} SOL`);
            console.log(`   输出金额: ${quote.outAmount} USDC`);
            console.log(`   价格: 1 SOL = ${(quote.outAmount / quote.inAmount).toFixed(6)} USDC`);
            
        } catch (quoteError) {
            console.log(`   ❌ getQuote方法失败: ${quoteError.message}`);
        }
        
    } catch (clientError) {
        console.log(`   ❌ JupiterClient测试失败: ${clientError.message}`);
        console.log(clientError.stack);
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('🎉 端点修复测试完成！');
    
    // 生成测试报告
    const report = {
        timestamp: new Date().toISOString(),
        config: {
            baseUrl: config.baseUrl,
            version: config.version,
            endpoints: config.endpoints,
            apiKeyConfigured: !!config.apiKey
        },
        testResults: '端点修复测试完成',
        recommendations: [
            '使用 /swap/v1/ 端点而不是 /v6/',
            '确保API密钥正确配置',
            '验证所有端点可访问'
        ]
    };
    
    const reportPath = path.join(__dirname, 'fixed_endpoints_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`测试报告已保存到: ${reportPath}`);
}

// 运行测试
testFixedEndpoints().catch(error => {
    console.error('❌ 测试过程中出现严重错误:', error);
    console.error(error.stack);
    process.exit(1);
});