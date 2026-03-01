#!/usr/bin/env node
/**
 * Orca 简单集成测试
 * 
 * 测试基本的 Orca API 集成，避免速率限制
 */

const OrcaClient = require('../src/trading/orca-client');

async function testSimpleOrcaIntegration() {
    console.log('🚀 开始 Orca 简单集成测试');
    console.log('='.repeat(60));
    console.log('📅 测试时间:', new Date().toISOString());
    console.log('='.repeat(60));
    
    const client = new OrcaClient();
    
    // 测试 1: 健康检查
    console.log('\n🏥 测试 1: 健康检查');
    try {
        const health = await client.healthCheck();
        console.log(`✅ 健康检查: ${health.healthy ? '正常' : '异常'}`);
        console.log(`   SOL 价格: $${health.price}`);
        console.log(`   响应时间: ${health.responseTime}ms`);
    } catch (error) {
        console.error(`❌ 健康检查失败: ${error.message}`);
        console.log('💡 注意: Orca API 可能有限制，使用备选方案');
    }
    
    // 测试 2: 获取 SOL 价格（主要测试）
    console.log('\n💰 测试 2: 获取 SOL 价格');
    try {
        const solPrice = await client.getTokenPrice(client.tokens.SOL);
        console.log(`✅ SOL 价格获取成功`);
        console.log(`   价格: $${solPrice.price}`);
        console.log(`   来源: ${solPrice.source || 'orca'}`);
        console.log(`   时间: ${solPrice.timestamp}`);
    } catch (error) {
        console.error(`❌ SOL 价格获取失败: ${error.message}`);
        console.log('💡 使用模拟价格继续测试');
    }
    
    // 测试 3: 模拟报价计算
    console.log('\n💱 测试 3: 模拟报价计算');
    try {
        // 使用模拟价格
        const solPrice = 86.61; // 模拟 SOL 价格
        const usdcPrice = 1.00; // USDC 价格
        
        const inputAmount = 0.1 * 1e9; // 0.1 SOL
        const inputValue = (inputAmount / 1e9) * solPrice;
        const outputAmount = (inputValue / usdcPrice) * 1e6;
        
        // 考虑滑点和费用
        const slippage = 0.005; // 0.5%
        const fee = 0.003; // 0.3%
        const finalOutput = outputAmount * (1 - slippage - fee);
        
        console.log(`✅ 模拟报价计算完成`);
        console.log(`   输入: 0.1 SOL ($${inputValue.toFixed(2)})`);
        console.log(`   输出: ${(finalOutput / 1e6).toFixed(4)} USDC`);
        console.log(`   滑点: ${(slippage * 100).toFixed(2)}%`);
        console.log(`   费用: ${(fee * 100).toFixed(2)}%`);
        console.log(`   净输出: $${(inputValue * (1 - fee)).toFixed(2)}`);
        
    } catch (error) {
        console.error(`❌ 模拟报价计算失败: ${error.message}`);
    }
    
    // 测试 4: 代币列表
    console.log('\n📋 测试 4: 代币列表');
    try {
        const tokenList = await client.getTokenList();
        console.log(`✅ 获取到 ${tokenList.length} 个代币`);
        console.log('   支持的代币:');
        tokenList.forEach(token => {
            console.log(`     ${token.symbol}: ${token.name}`);
        });
    } catch (error) {
        console.error(`❌ 代币列表获取失败: ${error.message}`);
    }
    
    // 测试 5: 性能指标
    console.log('\n📊 测试 5: 性能指标');
    const metrics = client.getMetrics();
    console.log(`   总请求: ${metrics.totalRequests}`);
    console.log(`   成功请求: ${metrics.successfulRequests}`);
    console.log(`   失败请求: ${metrics.failedRequests}`);
    console.log(`   成功率: ${metrics.successRate}`);
    console.log(`   平均响应时间: ${metrics.averageResponseTime.toFixed(2)}ms`);
    
    // 总结
    console.log('\n' + '='.repeat(60));
    console.log('📊 测试总结');
    console.log('='.repeat(60));
    
    console.log('🎯 Orca 集成测试完成');
    console.log('\n💡 关键发现:');
    console.log('   1. Orca API 可能需要处理速率限制');
    console.log('   2. CoinGecko API 有严格的速率限制 (429错误)');
    console.log('   3. 需要实现缓存机制避免频繁请求');
    console.log('   4. 考虑使用多个数据源提高可靠性');
    
    console.log('\n🔧 建议方案:');
    console.log('   A. 实现价格缓存 (5-10分钟TTL)');
    console.log('   B. 使用多个价格源 (Orca, CoinGecko, CoinMarketCap)');
    console.log('   C. 实现退避重试机制');
    console.log('   D. 对于测试环境，可以使用模拟价格');
    
    console.log('\n🚀 下一步:');
    console.log('   1. 创建带缓存的 PriceFetcher 服务');
    console.log('   2. 集成到 NeedleBot 交易系统');
    console.log('   3. 实现真实交易前的模拟测试');
    console.log('   4. 获取 Jupiter API 密钥进行完整集成');
    
    console.log('\n' + '='.repeat(60));
    
    return {
        success: metrics.successfulRequests > 0,
        metrics,
        recommendations: [
            '实现价格缓存机制',
            '使用多个数据源',
            '获取 Jupiter API 密钥'
        ]
    };
}

// 运行测试
if (require.main === module) {
    testSimpleOrcaIntegration()
        .then(results => {
            if (results.success) {
                console.log('\n🎉 Orca 集成测试成功！');
                console.log('💡 可以开始集成到 NeedleBot 交易系统。');
                process.exit(0);
            } else {
                console.log('\n⚠️  Orca 集成遇到限制，建议使用模拟模式。');
                console.log('📋 下一步:');
                console.log('   1. 实现价格缓存避免速率限制');
                console.log('   2. 注册 Jupiter 获取 API 密钥');
                console.log('   3. 使用模拟交易进行策略测试');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('💥 测试执行失败:', error);
            process.exit(1);
        });
}

module.exports = { testSimpleOrcaIntegration };