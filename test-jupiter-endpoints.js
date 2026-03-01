#!/usr/bin/env node
/**
 * Jupiter API 端点测试脚本
 * 测试所有API端点的可用性和正确性
 */

const axios = require('axios');
const config = require('./config/jupiter-config.json');

class JupiterEndpointTester {
    constructor() {
        this.apiKey = config.apiKey;
        this.results = [];
    }

    async testEndpoint(name, method, url, data = null, params = null) {
        const startTime = Date.now();
        try {
            const headers = {
                'x-api-key': this.apiKey,
                'Content-Type': 'application/json'
            };

            let response;
            if (method === 'GET') {
                response = await axios.get(url, { headers, params, timeout: 10000 });
            } else if (method === 'POST') {
                response = await axios.post(url, data, { headers, timeout: 10000 });
            }

            const duration = Date.now() - startTime;
            
            return {
                name,
                method,
                url,
                status: 'success',
                statusCode: response.status,
                duration,
                data: response.data ? '数据接收成功' : '无数据'
            };
        } catch (error) {
            const duration = Date.now() - startTime;
            
            return {
                name,
                method,
                url,
                status: 'error',
                statusCode: error.response?.status || 0,
                duration,
                error: error.message,
                responseData: error.response?.data
            };
        }
    }

    async testAllEndpoints() {
        console.log('🚀 开始测试Jupiter API所有端点...\n');

        // 1. 测试Metis API端点
        console.log('📊 Metis API (Swap API):');
        
        // 测试quote端点
        const quoteResult = await this.testEndpoint(
            'Quote',
            'GET',
            `${config.metisApi.baseUrl}${config.metisApi.endpoints.quote}`,
            null,
            {
                inputMint: 'So11111111111111111111111111111111111111112',
                outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                amount: 1000000,
                slippageBps: 100
            }
        );
        this.results.push(quoteResult);
        console.log(`  ${quoteResult.status === 'success' ? '✅' : '❌'} ${quoteResult.name}: ${quoteResult.statusCode} (${quoteResult.duration}ms)`);

        // 测试swap端点 (需要先获取quote)
        if (quoteResult.status === 'success') {
            const swapData = {
                quoteResponse: quoteResult.responseData || {
                    inAmount: 1000000,
                    outAmount: 82913,
                    swapMode: 'ExactIn',
                    slippageBps: 100,
                    userPublicKey: '2LhAWAWRzt5cGv7qWq1md4S2mvoxTmKSVxTEEuuq9ei5'
                },
                userPublicKey: '2LhAWAWRzt5cGv7qWq1md4S2mvoxTmKSVxTEEuuq9ei5'
            };

            const swapResult = await this.testEndpoint(
                'Swap',
                'POST',
                `${config.metisApi.baseUrl}${config.metisApi.endpoints.swap}`,
                swapData
            );
            this.results.push(swapResult);
            console.log(`  ${swapResult.status === 'success' ? '✅' : '❌'} ${swapResult.name}: ${swapResult.statusCode} (${swapResult.duration}ms)`);
        }

        // 2. 测试Tokens API端点
        console.log('\n📊 Tokens API:');
        
        const tokensResult = await this.testEndpoint(
            'Search Tokens',
            'GET',
            `${config.tokensApi.baseUrl}${config.tokensApi.endpoints.search}`,
            null,
            { query: 'SOL' }
        );
        this.results.push(tokensResult);
        console.log(`  ${tokensResult.status === 'success' ? '✅' : '❌'} ${tokensResult.name}: ${tokensResult.statusCode} (${tokensResult.duration}ms)`);

        // 3. 测试Price API端点
        console.log('\n📊 Price API:');
        
        const priceResult = await this.testEndpoint(
            'Get Price',
            'GET',
            `${config.priceApi.baseUrl}${config.priceApi.endpoints.price}`,
            null,
            { ids: 'So11111111111111111111111111111111111111112' }
        );
        this.results.push(priceResult);
        console.log(`  ${priceResult.status === 'success' ? '✅' : '❌'} ${priceResult.name}: ${priceResult.statusCode} (${tokensResult.duration}ms)`);

        // 4. 测试Ultra API端点
        if (config.ultraApi.enabled) {
            console.log('\n📊 Ultra API:');
            
            const ultraResult = await this.testEndpoint(
                'Ultra Search',
                'GET',
                `${config.ultraApi.baseUrl}${config.ultraApi.endpoints.search}`,
                null,
                { query: 'SOL' }
            );
            this.results.push(ultraResult);
            console.log(`  ${ultraResult.status === 'success' ? '✅' : '❌'} ${ultraResult.name}: ${ultraResult.statusCode} (${ultraResult.duration}ms)`);
        }

        // 打印总结
        console.log('\n📈 测试总结:');
        const total = this.results.length;
        const success = this.results.filter(r => r.status === 'success').length;
        const failed = total - success;
        
        console.log(`  总计测试: ${total}`);
        console.log(`  成功: ${success} (${Math.round(success/total*100)}%)`);
        console.log(`  失败: ${failed} (${Math.round(failed/total*100)}%)`);
        
        if (failed > 0) {
            console.log('\n🔧 需要修复的端点:');
            this.results
                .filter(r => r.status === 'error')
                .forEach(r => {
                    console.log(`  ❌ ${r.name}: ${r.error}`);
                    if (r.responseData) {
                        console.log(`     响应: ${JSON.stringify(r.responseData)}`);
                    }
                });
        }

        return this.results;
    }
}

// 运行测试
async function main() {
    const tester = new JupiterEndpointTester();
    const results = await tester.testAllEndpoints();
    
    // 保存测试结果
    const fs = require('fs');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultFile = `./test-results/jupiter-endpoints-${timestamp}.json`;
    
    fs.writeFileSync(resultFile, JSON.stringify(results, null, 2));
    console.log(`\n📁 测试结果已保存到: ${resultFile}`);
    
    // 返回退出码
    const hasErrors = results.some(r => r.status === 'error');
    process.exit(hasErrors ? 1 : 0);
}

main().catch(error => {
    console.error('❌ 测试执行失败:', error);
    process.exit(1);
});