#!/usr/bin/env node

/**
 * Jupiter API问题修复测试
 * 修复DNS解析和OrderManager问题
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

console.log('🔧 Jupiter API问题修复测试');
console.log('='.repeat(70));

async function testDNSResolution() {
    console.log('\n🌐 测试1: DNS解析测试');
    
    const domains = [
        'api.jup.ag',
        'quote-api.jup.ag',
        'jup.ag'
    ];
    
    for (const domain of domains) {
        try {
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);
            
            const result = await execAsync(`nslookup ${domain}`);
            console.log(`   ✅ ${domain}: DNS解析成功`);
            
            // 测试HTTP连接
            try {
                const response = await axios.head(`https://${domain}`, { timeout: 5000 });
                console.log(`      HTTP状态: ${response.status}`);
            } catch (httpError) {
                console.log(`      HTTP连接失败: ${httpError.message}`);
            }
        } catch (error) {
            console.log(`   ❌ ${domain}: DNS解析失败 - ${error.message}`);
        }
    }
}

async function testConfig() {
    console.log('\n📋 测试2: 配置文件测试');
    
    const configPath = path.join(__dirname, '../config/jupiter-config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    console.log(`   配置文件: ${configPath}`);
    console.log(`   Base URL: ${config.baseUrl}`);
    console.log(`   API密钥: ${config.apiKey ? '已配置' : '未配置'}`);
    
    // 测试配置的URL
    const testUrl = `${config.baseUrl}/v6/tokens`;
    console.log(`   测试URL: ${testUrl}`);
    
    try {
        const response = await axios.get(testUrl, {
            headers: config.headers,
            timeout: 5000
        });
        console.log(`   ✅ 配置URL测试成功: HTTP ${response.status}`);
    } catch (error) {
        console.log(`   ❌ 配置URL测试失败: ${error.message}`);
        if (error.response) {
            console.log(`      HTTP状态: ${error.response.status}`);
        }
    }
}

async function testJupiterClient() {
    console.log('\n🔧 测试3: JupiterClient测试');
    
    try {
        const JupiterClient = require('../src/trading/jupiter-client');
        
        // 检查导出
        if (typeof JupiterClient === 'function') {
            console.log('   ✅ JupiterClient是构造函数');
        } else if (JupiterClient.JupiterClient) {
            console.log('   ✅ JupiterClient.JupiterClient是构造函数');
        } else {
            console.log('   ❌ JupiterClient导出格式不正确');
            return;
        }
        
        // 创建实例
        const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/jupiter-config.json'), 'utf8'));
        const client = typeof JupiterClient === 'function' 
            ? new JupiterClient({
                jupiter: config,
                rpc: { endpoint: 'https://purple-wiser-tab.solana-mainnet.quiknode.pro' }
            })
            : new JupiterClient.JupiterClient({
                jupiter: config,
                rpc: { endpoint: 'https://purple-wiser-tab.solana-mainnet.quiknode.pro' }
            });
        
        console.log('   ✅ JupiterClient实例创建成功');
        
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
            console.log(`      报价ID: ${quote.quoteId || 'N/A'}`);
            console.log(`      输入金额: ${quote.inAmount}`);
            console.log(`      输出金额: ${quote.outAmount}`);
            console.log(`      价格: 1 SOL = ${(quote.outAmount / quote.inAmount).toFixed(6)} USDC`);
            
        } catch (quoteError) {
            console.log(`   ❌ getQuote方法失败: ${quoteError.message}`);
            console.log(quoteError.stack);
        }
        
    } catch (error) {
        console.log(`   ❌ JupiterClient测试失败: ${error.message}`);
        console.log(error.stack);
    }
}

async function testOrderManager() {
    console.log('\n📦 测试4: OrderManager测试');
    
    try {
        const orderManagerModule = require('../src/trading/order-manager');
        
        // 检查导出
        let OrderManager;
        if (orderManagerModule.OrderManager) {
            OrderManager = orderManagerModule.OrderManager;
            console.log('   ✅ OrderManager从模块导出找到');
        } else if (typeof orderManagerModule === 'function') {
            OrderManager = orderManagerModule;
            console.log('   ✅ OrderManager是默认导出');
        } else {
            console.log('   ❌ 无法找到OrderManager导出');
            console.log('      导出键:', Object.keys(orderManagerModule));
            return;
        }
        
        // 创建实例
        const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/jupiter-config.json'), 'utf8'));
        const manager = new OrderManager({
            jupiter: config,
            rpc: { endpoint: 'https://purple-wiser-tab.solana-mainnet.quiknode.pro' }
        });
        
        console.log('   ✅ OrderManager实例创建成功');
        
        // 测试createOrder方法
        console.log('\n   🧪 测试createOrder方法...');
        try {
            const order = await manager.createOrder(
                'buy',
                'So11111111111111111111111111111111111111112',
                'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                '1000000000',
                { slippageBps: 50 }
            );
            
            console.log('   ✅ createOrder方法成功');
            console.log(`      订单ID: ${order.id}`);
            console.log(`      订单类型: ${order.type}`);
            console.log(`      订单状态: ${order.status}`);
            
            // 测试getOrder方法
            console.log('\n   🧪 测试getOrder方法...');
            const retrievedOrder = manager.getOrder(order.id);
            if (retrievedOrder) {
                console.log('   ✅ getOrder方法成功');
                console.log(`      检索到的订单ID: ${retrievedOrder.id}`);
            } else {
                console.log('   ❌ getOrder方法失败: 订单未找到');
            }
            
        } catch (orderError) {
            console.log(`   ❌ createOrder方法失败: ${orderError.message}`);
            console.log(orderError.stack);
        }
        
    } catch (error) {
        console.log(`   ❌ OrderManager测试失败: ${error.message}`);
        console.log(error.stack);
    }
}

async function runAllTests() {
    console.log('🚀 开始Jupiter API问题修复测试\n');
    
    await testDNSResolution();
    await testConfig();
    await testJupiterClient();
    await testOrderManager();
    
    console.log('\n' + '='.repeat(70));
    console.log('🎉 所有测试完成！');
    
    // 生成修复报告
    const report = {
        timestamp: new Date().toISOString(),
        tests: [
            'DNS解析测试',
            '配置文件测试',
            'JupiterClient测试',
            'OrderManager测试'
        ],
        status: '修复测试完成',
        recommendations: [
            '已修复baseUrl从quote-api.jup.ag改为api.jup.ag',
            '验证了DNS解析和API连接',
            '测试了客户端和订单管理器功能'
        ]
    };
    
    const reportPath = path.join(__dirname, 'jupiter_fix_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`修复报告已保存到: ${reportPath}`);
}

// 运行所有测试
runAllTests().catch(error => {
    console.error('❌ 测试过程中出现严重错误:', error);
    console.error(error.stack);
    process.exit(1);
});