#!/usr/bin/env node

/**
 * 简单的 QuickNode 连接测试
 * 测试不同的 URL 格式
 */

const https = require('https');

// 测试不同的 QuickNode URL 格式
const TEST_URLS = [
    'https://solana-mainnet.quicknode.com/QN_96c3e3c8026243a2ab3f2ac94ec5efdd',
    'https://api.mainnet-beta.solana.com',  // 公共节点作为对比
    'https://solana-api.projectserum.com'   // 另一个公共节点
];

async function testUrl(url) {
    return new Promise((resolve, reject) => {
        console.log(`\n🔗 测试 URL: ${url}`);
        
        const req = https.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            timeout: 10000
        }, (res) => {
            console.log(`  状态码: ${res.statusCode}`);
            console.log(`  状态消息: ${res.statusMessage}`);
            
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    console.log(`  响应: ${JSON.stringify(json).slice(0, 200)}...`);
                    resolve({ success: true, statusCode: res.statusCode, data: json });
                } catch (e) {
                    console.log(`  响应解析失败: ${e.message}`);
                    resolve({ success: false, error: '解析失败' });
                }
            });
        });
        
        req.on('error', (error) => {
            console.log(`  请求错误: ${error.message}`);
            resolve({ success: false, error: error.message });
        });
        
        req.on('timeout', () => {
            console.log('  请求超时');
            req.destroy();
            resolve({ success: false, error: 'timeout' });
        });
        
        // 发送一个简单的 JSON-RPC 请求
        const requestBody = JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getHealth',
            params: []
        });
        
        req.write(requestBody);
        req.end();
    });
}

async function main() {
    console.log('🌐 QuickNode URL 格式测试');
    console.log('='.repeat(50));
    
    const results = [];
    
    for (const url of TEST_URLS) {
        const result = await testUrl(url);
        results.push({ url, ...result });
        
        // 短暂延迟
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n📋 测试结果汇总:');
    console.log('='.repeat(50));
    
    results.forEach((result, index) => {
        const status = result.success ? '✅' : '❌';
        console.log(`${status} ${result.url}`);
        if (result.error) {
            console.log(`   错误: ${result.error}`);
        }
    });
    
    // 检查 QuickNode 文档中的正确格式
    console.log('\n🔧 QuickNode RPC URL 格式参考:');
    console.log('通常格式: https://example.solana-mainnet.quicknode.com/your-token');
    console.log('或: https://your-endpoint-name.solana-mainnet.quicknode.com/your-token');
    console.log('\n💡 建议:');
    console.log('1. 登录 QuickNode 控制台获取正确的 RPC URL');
    console.log('2. 检查 API 密钥是否包含完整端点名称');
    console.log('3. 确认账户状态和网络权限');
}

main().catch(console.error);