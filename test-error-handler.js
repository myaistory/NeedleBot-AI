#!/usr/bin/env node
/**
 * 测试错误处理器
 */

const JupiterErrorHandler = require('./src/trading/error-handler');
const axios = require('axios');

async function testErrorHandler() {
    console.log('🧪 测试Jupiter错误处理器...\n');
    
    // 创建错误处理器
    const errorHandler = new JupiterErrorHandler({
        maxRetries: 3,
        retryDelay: 1000,
        circuitBreakerThreshold: 3
    });
    
    // 测试1: 网络错误
    console.log('1. 测试网络错误处理:');
    try {
        await errorHandler.handleWithRetry(async () => {
            throw { 
                code: 'ECONNREFUSED', 
                message: 'Connection refused' 
            };
        }, { endpoint: '/swap/v1/quote', operation: 'getQuote' });
    } catch (error) {
        console.log(`  结果: ${error.message}`);
        console.log(`  错误类型: ${error.errorInfo.type}`);
        console.log(`  重试次数: ${error.attempts}`);
    }
    
    // 测试2: 速率限制错误
    console.log('\n2. 测试速率限制错误:');
    try {
        await errorHandler.handleWithRetry(async () => {
            throw { 
                response: { status: 429 },
                message: 'Too many requests' 
            };
        }, { endpoint: '/swap/v1/quote', operation: 'getQuote' });
    } catch (error) {
        console.log(`  结果: ${error.message}`);
        console.log(`  错误类型: ${error.errorInfo.type}`);
    }
    
    // 测试3: 验证错误（不应该重试）
    console.log('\n3. 测试验证错误:');
    try {
        await errorHandler.handleWithRetry(async () => {
            throw { 
                response: { 
                    status: 422,
                    data: { error: 'Validation failed' }
                },
                message: 'Invalid parameters' 
            };
        }, { endpoint: '/swap/v1/swap', operation: 'getSwapInstruction' });
    } catch (error) {
        console.log(`  结果: ${error.message}`);
        console.log(`  错误类型: ${error.errorInfo.type}`);
        console.log(`  是否重试: ${error.errorInfo.shouldRetry ? '是' : '否'}`);
    }
    
    // 测试4: 断路器测试
    console.log('\n4. 测试断路器模式:');
    for (let i = 1; i <= 5; i++) {
        try {
            await errorHandler.handleWithRetry(async () => {
                throw { 
                    code: 'ETIMEDOUT',
                    message: 'Request timeout' 
                };
            }, { endpoint: '/swap/v1/quote', operation: 'getQuote', attempt: i });
        } catch (error) {
            console.log(`  尝试 ${i}: ${error.message}`);
            
            if (error.message.includes('断路器')) {
                console.log(`  🚨 断路器已触发！`);
                break;
            }
        }
    }
    
    // 测试5: 数据验证和修复
    console.log('\n5. 测试数据验证和修复:');
    const testData = {
        inAmount: 1000000, // 数字，应该转换为字符串
        outAmount: 82913,  // 数字，应该转换为字符串
        slippageBps: 100,  // 数字，应该转换为字符串
        priceImpactPct: 0.5 // 数字，应该转换为字符串
    };
    
    console.log('  修复前:', JSON.stringify(testData));
    const fixedData = errorHandler.validateAndFixQuoteData(testData);
    console.log('  修复后:', JSON.stringify(fixedData));
    
    // 测试6: 优雅降级
    console.log('\n6. 测试优雅降级:');
    const networkError = {
        type: 'network',
        message: 'Network connection failed'
    };
    const fallback = errorHandler.createFallbackResponse(networkError, {});
    console.log('  降级响应:', JSON.stringify(fallback, null, 2));
    
    // 显示统计信息
    console.log('\n📊 错误统计:');
    const stats = errorHandler.getErrorStats();
    console.log('  总错误数:', stats.totalErrors);
    console.log('  连续错误数:', stats.consecutiveErrors);
    console.log('  错误类型分布:', JSON.stringify(stats.byType, null, 2));
    console.log('  断路器状态:', stats.circuitBreaker.isOpen ? '打开' : '关闭');
    
    console.log('\n✅ 错误处理器测试完成！');
}

// 运行测试
testErrorHandler().catch(error => {
    console.error('❌ 测试失败:', error);
    process.exit(1);
});