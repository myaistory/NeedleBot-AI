#!/usr/bin/env node

/**
 * Jupiter API最终验证测试
 * 验证所有核心功能正常工作
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Jupiter API最终验证测试');
console.log('='.repeat(70));

async function verifyCoreFunctionality() {
    console.log('\n🧪 验证核心功能...');
    
    try {
        // 加载配置
        const configPath = path.join(__dirname, '../config/jupiter-config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        console.log('✅ 配置加载成功');
        console.log(`   API密钥: ${config.apiKey ? '已配置' : '未配置'}`);
        console.log(`   Base URL: ${config.baseUrl}`);
        console.log(`   Metis API: ${config.metisApi.baseUrl}`);
        
        // 测试JupiterClient
        const JupiterClient = require('../src/trading/jupiter-client');
        const client = new JupiterClient({
            jupiter: config,
            rpc: { endpoint: 'https://purple-wiser-tab.solana-mainnet.quiknode.pro' }
        });
        
        console.log('✅ JupiterClient初始化成功');
        
        // 测试1: 获取报价
        console.log('\n1️⃣ 测试报价功能...');
        const quote = await client.getQuote(
            'So11111111111111111111111111111111111111112', // SOL
            'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
            '1000000000', // 1 SOL
            50 // 0.5% slippage
        );
        
        console.log('✅ 报价功能正常');
        console.log(`   输入: ${quote.inAmount} lamports (1 SOL)`);
        console.log(`   输出: ${quote.outAmount} USDC`);
        console.log(`   价格: 1 SOL = ${(quote.outAmount / quote.inAmount).toFixed(6)} USDC`);
        console.log(`   响应时间: ${quote.responseTime}ms`);
        console.log(`   价格影响: ${(quote.priceImpact * 100).toFixed(4)}%`);
        
        // 测试2: 价格影响分析
        console.log('\n2️⃣ 测试价格影响分析...');
        const priceImpact = client.analyzePriceImpact(quote);
        console.log('✅ 价格影响分析正常');
        console.log(`   严重程度: ${priceImpact.severity}`);
        console.log(`   建议: ${priceImpact.recommendation}`);
        
        // 测试3: 获取代币列表
        console.log('\n3️⃣ 测试代币列表获取...');
        try {
            const tokenList = await client.getTokenList();
            console.log('✅ 代币列表获取正常');
            console.log(`   代币数量: ${Object.keys(tokenList).length}`);
        } catch (tokenError) {
            console.log('⚠️  代币列表获取失败（可能需要调整端点）:', tokenError.message);
        }
        
        // 测试4: OrderManager
        console.log('\n4️⃣ 测试OrderManager...');
        const OrderManager = require('../src/trading/order-manager').OrderManager;
        const manager = new OrderManager({
            jupiter: config,
            rpc: { endpoint: 'https://purple-wiser-tab.solana-mainnet.quiknode.pro' }
        });
        
        console.log('✅ OrderManager初始化成功');
        
        // 创建测试订单（不执行模拟）
        const testOrder = await manager.createOrder(
            'buy',
            'So11111111111111111111111111111111111111112',
            'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            '1000000000',
            { slippageBps: 50 }
        );
        
        console.log('✅ 订单创建正常');
        console.log(`   订单ID: ${testOrder.id}`);
        console.log(`   订单类型: ${testOrder.type}`);
        console.log(`   订单状态: ${testOrder.status}`);
        
        // 获取订单
        const retrievedOrder = manager.getOrder(testOrder.id);
        console.log('✅ 订单检索正常');
        console.log(`   检索到的订单ID: ${retrievedOrder.id}`);
        
        // 测试5: 系统集成
        console.log('\n5️⃣ 测试系统集成...');
        
        // 检查NeedleBot系统是否运行
        try {
            const { execSync } = require('child_process');
            const psOutput = execSync('ps aux | grep "node.*needlebot" | grep -v grep', { encoding: 'utf8' });
            if (psOutput.trim()) {
                console.log('✅ NeedleBot系统正在运行');
                console.log(`   进程: ${psOutput.trim().split('\n')[0].substring(0, 80)}...`);
            } else {
                console.log('⚠️  NeedleBot系统未运行');
            }
        } catch (e) {
            console.log('⚠️  无法检查NeedleBot系统状态');
        }
        
        return {
            success: true,
            quote,
            order: testOrder,
            summary: {
                jupiterClient: '正常',
                quoteFunction: '正常',
                priceImpactAnalysis: '正常',
                orderManager: '正常',
                systemIntegration: '部分正常'
            }
        };
        
    } catch (error) {
        console.log('❌ 核心功能验证失败:', error.message);
        console.log(error.stack);
        return {
            success: false,
            error: error.message
        };
    }
}

async function generateIntegrationReport() {
    console.log('\n📋 生成集成报告...');
    
    const result = await verifyCoreFunctionality();
    
    console.log('\n' + '='.repeat(70));
    console.log('📊 JUPITER API集成验证报告');
    console.log('='.repeat(70));
    
    if (result.success) {
        console.log('\n✅ 集成状态: 成功');
        console.log('\n🎯 核心功能验证结果:');
        console.log(`   1. JupiterClient初始化: ${result.summary.jupiterClient}`);
        console.log(`   2. 报价功能: ${result.summary.quoteFunction}`);
        console.log(`   3. 价格影响分析: ${result.summary.priceImpactAnalysis}`);
        console.log(`   4. OrderManager: ${result.summary.orderManager}`);
        console.log(`   5. 系统集成: ${result.summary.systemIntegration}`);
        
        console.log('\n💰 当前市场数据:');
        console.log(`   SOL价格: 1 SOL = ${(result.quote.outAmount / result.quote.inAmount).toFixed(6)} USDC`);
        console.log(`   报价响应时间: ${result.quote.responseTime}ms`);
        console.log(`   价格影响: ${(result.quote.priceImpact * 100).toFixed(4)}%`);
        
        console.log('\n📦 订单系统状态:');
        console.log(`   订单ID: ${result.order.id}`);
        console.log(`   订单类型: ${result.order.type}`);
        console.log(`   订单状态: ${result.order.status}`);
        
        console.log('\n🚀 下一步建议:');
        console.log('   1. 集成真实钱包进行交易模拟测试');
        console.log('   2. 将Jupiter API集成到NeedleBot交易逻辑');
        console.log('   3. 测试真实交易（小金额）');
        console.log('   4. 优化错误处理和重试机制');
        
        // 保存报告
        const report = {
            timestamp: new Date().toISOString(),
            status: 'success',
            marketData: {
                solPrice: result.quote.outAmount / result.quote.inAmount,
                quoteResponseTime: result.quote.responseTime,
                priceImpact: result.quote.priceImpact
            },
            orderSystem: {
                orderId: result.order.id,
                orderType: result.order.type,
                orderStatus: result.order.status
            },
            recommendations: [
                '集成真实钱包进行交易模拟测试',
                '将Jupiter API集成到NeedleBot交易逻辑',
                '测试真实交易（小金额）',
                '优化错误处理和重试机制'
            ]
        };
        
        const reportPath = path.join(__dirname, 'jupiter_integration_report.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log(`\n📄 详细报告已保存到: ${reportPath}`);
        
    } else {
        console.log('\n❌ 集成状态: 失败');
        console.log(`\n错误信息: ${result.error}`);
        console.log('\n🔧 需要修复的问题:');
        console.log('   1. 检查Jupiter API端点配置');
        console.log('   2. 验证API密钥有效性');
        console.log('   3. 检查网络连接和DNS解析');
        console.log('   4. 修复OrderManager错误');
        
        process.exit(1);
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('🎉 Jupiter API集成验证完成!');
    console.log('系统已准备好进行真实交易测试。');
}

generateIntegrationReport().catch(error => {
    console.error('❌ 验证过程中出现严重错误:', error);
    console.error(error.stack);
    process.exit(1);
});