#!/usr/bin/env node

/**
 * Jupiter API快速修复测试
 * 测试修复后的Jupiter客户端和OrderManager
 */

const path = require('path');
const fs = require('fs');

// 加载配置
const configPath = path.join(__dirname, '../config/jupiter-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

console.log('🚀 Jupiter API快速修复测试');
console.log('='.repeat(60));

async function runQuickTest() {
  try {
    // 1. 测试配置加载
    console.log('📋 测试1: 配置加载测试');
    console.log(`   API密钥: ${config.apiKey ? '已配置' : '未配置'}`);
    console.log(`   Base URL: ${config.baseUrl}`);
    console.log(`   API版本: ${config.version}`);
    console.log(`   端点配置: ${Object.keys(config.endpoints).length} 个端点`);
    
    // 2. 测试API连接
    console.log('\n🌐 测试2: API连接测试');
    
    const axios = require('axios');
    const testUrl = `${config.baseUrl}${config.endpoints.tokens}`;
    console.log(`   测试URL: ${testUrl}`);
    
    try {
      const response = await axios.get(testUrl, {
        headers: config.headers,
        timeout: 5000
      });
      
      console.log(`   ✅ 连接成功: HTTP ${response.status}`);
      if (response.data && Array.isArray(response.data)) {
        console.log(`   代币数量: ${response.data.length}`);
      }
    } catch (error) {
      console.log(`   ❌ 连接失败: ${error.message}`);
      if (error.response) {
        console.log(`   HTTP状态: ${error.response.status}`);
        console.log(`   错误信息: ${JSON.stringify(error.response.data)}`);
      }
    }
    
    // 3. 测试报价端点
    console.log('\n💰 测试3: 报价端点测试');
    const quoteUrl = `${config.baseUrl}${config.endpoints.quote}`;
    console.log(`   报价URL: ${quoteUrl}`);
    
    // 测试SOL到USDC的报价
    const testParams = {
      inputMint: 'So11111111111111111111111111111111111111112', // SOL
      outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      amount: '1000000000', // 1 SOL (9 decimals)
      slippageBps: '50'
    };
    
    const queryString = new URLSearchParams(testParams).toString();
    const fullQuoteUrl = `${quoteUrl}?${queryString}`;
    console.log(`   完整URL: ${fullQuoteUrl.substring(0, 100)}...`);
    
    try {
      const startTime = Date.now();
      const response = await axios.get(fullQuoteUrl, {
        headers: config.headers,
        timeout: 10000
      });
      const responseTime = Date.now() - startTime;
      
      console.log(`   ✅ 报价获取成功: ${responseTime}ms`);
      console.log(`   HTTP状态: ${response.status}`);
      
      if (response.data) {
        const quote = response.data;
        console.log(`   输入金额: ${quote.inAmount} (${quote.inputMint})`);
        console.log(`   输出金额: ${quote.outAmount} (${quote.outputMint})`);
        console.log(`   价格: 1 SOL = ${(quote.outAmount / quote.inAmount).toFixed(6)} USDC`);
        
        if (quote.routePlan) {
          console.log(`   路由路径: ${quote.routePlan.length} 步`);
        }
      }
    } catch (error) {
      console.log(`   ❌ 报价获取失败: ${error.message}`);
      if (error.response) {
        console.log(`   HTTP状态: ${error.response.status}`);
        if (error.response.data) {
          console.log(`   错误详情: ${JSON.stringify(error.response.data)}`);
        }
      }
    }
    
    // 4. 测试客户端初始化
    console.log('\n🔧 测试4: 客户端初始化测试');
    try {
      const JupiterClient = require('../src/trading/jupiter-client');
      const client = new JupiterClient({
        jupiter: config,
        rpc: {
          endpoint: 'https://purple-wiser-tab.solana-mainnet.quiknode.pro'
        }
      });
      
      console.log('   ✅ JupiterClient初始化成功');
      console.log(`   客户端版本: ${client.constructor.name}`);
      
      // 测试获取报价方法
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
        console.log(`   输入: ${quote.inAmount} SOL`);
        console.log(`   输出: ${quote.outAmount} USDC`);
        console.log(`   价格影响: ${quote.priceImpact || 'N/A'}`);
        
      } catch (quoteError) {
        console.log(`   ❌ getQuote方法失败: ${quoteError.message}`);
      }
      
    } catch (clientError) {
      console.log(`   ❌ JupiterClient初始化失败: ${clientError.message}`);
      console.log(clientError.stack);
    }
    
    // 5. 测试OrderManager
    console.log('\n📦 测试5: OrderManager测试');
    try {
      const OrderManager = require('../src/trading/order-manager');
      const orderManager = new OrderManager({
        jupiter: config,
        rpc: {
          endpoint: 'https://purple-wiser-tab.solana-mainnet.quiknode.pro'
        },
        orderManager: {
          maxRetries: 2,
          orderTimeout: 60000
        }
      });
      
      console.log('   ✅ OrderManager初始化成功');
      
      // 测试创建订单
      console.log('\n   🧪 测试createOrder方法...');
      try {
        const order = await orderManager.createOrder(
          'buy', // 明确传递字符串
          'So11111111111111111111111111111111111111112',
          'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          '1000000000',
          {
            slippageBps: 50
          }
        );
        
        console.log('   ✅ createOrder方法成功');
        console.log(`   订单ID: ${order.id}`);
        console.log(`   订单类型: ${order.type}`);
        console.log(`   订单状态: ${order.status}`);
        console.log(`   创建时间: ${order.createdAt}`);
        
        // 测试获取订单
        console.log('\n   🧪 测试getOrder方法...');
        const retrievedOrder = orderManager.getOrder(order.id);
        if (retrievedOrder) {
          console.log('   ✅ getOrder方法成功');
          console.log(`   检索到的订单ID: ${retrievedOrder.id}`);
        } else {
          console.log('   ❌ getOrder方法失败: 订单未找到');
        }
        
      } catch (orderError) {
        console.log(`   ❌ createOrder方法失败: ${orderError.message}`);
        console.log(orderError.stack);
      }
      
    } catch (managerError) {
      console.log(`   ❌ OrderManager初始化失败: ${managerError.message}`);
      console.log(managerError.stack);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 快速修复测试完成！');
    
    // 生成测试报告
    const testReport = {
      timestamp: new Date().toISOString(),
      config: {
        apiKeyConfigured: !!config.apiKey,
        baseUrl: config.baseUrl,
        version: config.version,
        endpoints: Object.keys(config.endpoints)
      },
      summary: 'Jupiter API快速修复测试完成'
    };
    
    const reportPath = path.join(__dirname, 'quick_fix_test_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(testReport, null, 2));
    console.log(`测试报告已保存到: ${reportPath}`);
    
  } catch (error) {
    console.error('❌ 测试过程中出现严重错误:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行测试
runQuickTest();