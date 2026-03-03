#!/usr/bin/env node
/**
 * Jupiter API 最终集成测试
 * 
 * 测试完整的Jupiter API集成，包括配置加载和客户端功能
 */

const fs = require('fs');
const path = require('path');

// 加载配置
const configPath = path.join(__dirname, '../config/jupiter-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

console.log('🚀 Jupiter API 最终集成测试');
console.log('='.repeat(70));
console.log(`配置加载: ${config.apiKey ? '✅ 已配置API密钥' : '❌ 未配置API密钥'}`);
console.log(`基础URL: ${config.baseUrl}`);
console.log(`版本: ${config.version}`);
console.log(`端点:`);
console.log(`  - 报价: ${config.endpoints.quote}`);
console.log(`  - 交换: ${config.endpoints.swap}`);
console.log(`  - 代币: ${config.endpoints.tokens}`);
console.log(`  - 价格: ${config.endpoints.price}`);

// 动态加载JupiterClient
const JupiterClient = require('../src/trading/jupiter-client').JupiterClient || require('../src/trading/jupiter-client');

async function runTests() {
    console.log('\n🔧 创建Jupiter客户端实例...');
    
    const jupiterConfig = {
        jupiter: {
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
            timeout: config.timeoutMs,
            maxRetries: config.retryAttempts,
            retryDelay: config.retryDelayMs,
            endpoints: config.endpoints
        },
        rpc: {
            endpoint: 'https://purple-wiser-tab.solana-mainnet.quiknode.pro',
            timeout: 5000
        },
        trading: {
            defaultSlippageBps: config.defaultSlippageBps,
            maxSlippageBps: 100,
            minLiquidity: 1000
        }
    };
    
    try {
        const client = new JupiterClient(jupiterConfig);
        console.log('✅ Jupiter客户端创建成功');
        
        // 测试代币
        const SOL = 'So11111111111111111111111111111111111111112';
        const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
        
        console.log('\n1️⃣ 测试getQuote方法...');
        try {
            const quote = await client.getQuote(SOL, USDC, 1000000000, 50); // 1 SOL
            console.log(`✅ 报价获取成功`);
            console.log(`   输入: 1 SOL`);
            console.log(`   输出: ${quote.outAmount / 1e6} USDC`);
            console.log(`   价格: ${(quote.outAmount / 1000000000 * 1e3).toFixed(4)} USDC/SOL`);
            console.log(`   价格影响: ${(quote.priceImpact * 100).toFixed(4)}%`);
            console.log(`   路径: ${quote.routePath || '直接交换'}`);
            
            // 保存quote用于后续测试
            global.testQuote = quote;
            
        } catch (error) {
            console.error(`❌ 报价获取失败: ${error.message}`);
            if (error.response) {
                console.error(`   状态码: ${error.response.status}`);
                console.error(`   响应: ${JSON.stringify(error.response.data, null, 2).substring(0, 200)}...`);
            }
        }
        
        console.log('\n2️⃣ 测试getTokenList方法...');
        try {
            const tokenList = await client.getTokenList();
            console.log(`✅ 代币列表获取成功`);
            console.log(`   代币数量: ${tokenList.length || '未知'}`);
            
            if (tokenList && tokenList.length > 0) {
                // 显示前3个代币
                console.log('   前3个代币:');
                tokenList.slice(0, 3).forEach((token, index) => {
                    console.log(`     ${index + 1}. ${token.symbol || '未知'} (${token.address || '未知'})`);
                });
            }
            
        } catch (error) {
            console.error(`❌ 代币列表获取失败: ${error.message}`);
            console.log(`   ℹ️  可能端点不正确，尝试直接API调用...`);
            
            // 尝试直接API调用
            try {
                const axios = require('axios');
                const response = await axios.get(`${config.baseUrl}${config.endpoints.tokens}`, {
                    headers: { 'x-api-key': config.apiKey },
                    timeout: 10000
                });
                console.log(`   ✅ 直接API调用成功: ${response.status}`);
                console.log(`      代币数量: ${response.data?.length || '未知'}`);
            } catch (directError) {
                console.error(`   ❌ 直接API调用也失败: ${directError.message}`);
            }
        }
        
        console.log('\n3️⃣ 测试analyzePriceImpact方法...');
        try {
            if (global.testQuote) {
                const analysis = await client.analyzePriceImpact(global.testQuote);
                console.log(`✅ 价格影响分析成功`);
                console.log(`   严重程度: ${analysis.severity}`);
                console.log(`   影响百分比: ${(analysis.impactPercentage * 100).toFixed(4)}%`);
                console.log(`   建议: ${analysis.recommendation}`);
            } else {
                console.log(`⚠️  需要先获取报价才能测试价格影响分析`);
            }
        } catch (error) {
            console.error(`❌ 价格影响分析失败: ${error.message}`);
        }
        
        console.log('\n4️⃣ 测试simulateTransaction方法...');
        try {
            if (global.testQuote) {
                // 使用测试公钥
                const testPublicKey = '11111111111111111111111111111111';
                const simulation = await client.simulateTransaction(global.testQuote, testPublicKey);
                console.log(`✅ 交易模拟成功`);
                console.log(`   模拟状态: ${simulation.success ? '成功' : '失败'}`);
                console.log(`   日志数量: ${simulation.logs?.length || 0}`);
                console.log(`   错误: ${simulation.error || '无'}`);
            } else {
                console.log(`⚠️  需要先获取报价才能测试交易模拟`);
            }
        } catch (error) {
            console.error(`❌ 交易模拟失败: ${error.message}`);
        }
        
        console.log('\n5️⃣ 测试getSwapInstruction方法...');
        try {
            if (global.testQuote) {
                // 使用测试公钥
                const testPublicKey = '11111111111111111111111111111111';
                const swapInstruction = await client.getSwapInstruction(global.testQuote, testPublicKey);
                console.log(`✅ 交换指令获取成功`);
                console.log(`   指令类型: ${swapInstruction.type || '未知'}`);
                console.log(`   交易大小: ${swapInstruction.transaction?.length || 0} bytes`);
            } else {
                console.log(`⚠️  需要先获取报价才能测试交换指令`);
            }
        } catch (error) {
            console.error(`❌ 交换指令获取失败: ${error.message}`);
        }
        
        console.log('\n6️⃣ 测试OrderManager集成...');
        try {
            const OrderManager = require('../src/trading/order-manager').OrderManager || require('../src/trading/order-manager');
            const orderManager = new OrderManager({
                jupiter: jupiterConfig.jupiter,
                rpc: jupiterConfig.rpc
            });
            
            console.log(`✅ OrderManager创建成功`);
            
            // 测试创建模拟订单
            const testOrder = {
                inputMint: SOL,
                outputMint: USDC,
                amount: 100000000,
                slippageBps: 50,
                type: 'limit',
                status: 'pending'
            };
            
            const orderId = await orderManager.createOrder(testOrder);
            console.log(`✅ 模拟订单创建成功`);
            console.log(`   订单ID: ${orderId}`);
            
            // 测试获取订单
            const retrievedOrder = await orderManager.getOrder(orderId);
            console.log(`✅ 订单获取成功`);
            console.log(`   订单状态: ${retrievedOrder.status}`);
            console.log(`   订单类型: ${retrievedOrder.type}`);
            
        } catch (error) {
            console.error(`❌ OrderManager测试失败: ${error.message}`);
        }
        
        console.log('\n' + '='.repeat(70));
        console.log('📊 测试结果总结');
        console.log('-'.repeat(40));
        
        // 显示客户端指标
        if (client.metrics) {
            console.log(`总报价请求: ${client.metrics.totalQuotes || 0}`);
            console.log(`成功报价: ${client.metrics.successfulQuotes || 0}`);
            console.log(`失败报价: ${client.metrics.failedQuotes || 0}`);
            console.log(`平均响应时间: ${client.metrics.averageResponseTime || 0}ms`);
        }
        
        console.log('\n🎉 Jupiter API集成测试完成！');
        console.log('\n💡 下一步:');
        console.log('1. 如果所有测试通过，Jupiter API集成已准备就绪');
        console.log('2. 可以开始真实交易测试（使用真实钱包）');
        console.log('3. 集成到NeedleBot主系统中');
        
    } catch (error) {
        console.error(`💥 Jupiter客户端创建失败: ${error.message}`);
        console.error(`堆栈: ${error.stack}`);
        process.exit(1);
    }
}

// 运行测试
runTests().catch(error => {
    console.error('💥 测试执行失败:', error);
    process.exit(1);
});