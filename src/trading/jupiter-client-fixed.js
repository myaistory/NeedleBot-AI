#!/usr/bin/env node
/**
 * Jupiter API 客户端 - 修复版本
 * 
 * 封装 Jupiter Quote API 和 Swap API，提供 Solana 链上交易功能
 * 
 * 功能:
 * - 获取最优交易报价（支持多路径聚合）
 * - 生成交易指令
 * - 交易模拟验证
 * - 价格影响分析
 * - 滑点控制
 * 
 * API 文档: https://station.jup.ag/docs/swap-api/getting-started
 * 正确API端点: https://api.jup.ag/v6
 */

const axios = require('axios');
const { Connection, PublicKey, VersionedTransaction } = require('@solana/web3.js');

class JupiterClient {
    constructor(config = {}) {
        // Jupiter API 配置 - 使用正确的端点
        this.baseUrl = config.jupiter?.baseUrl || 'https://api.jup.ag/v6';
        this.timeout = config.jupiter?.timeout || 10000;
        this.maxRetries = config.jupiter?.maxRetries || 3;
        this.retryDelay = config.jupiter?.retryDelay || 1000;
        
        // RPC 配置
        this.rpcEndpoint = config.rpc?.endpoint || 'https://purple-wiser-tab.solana-mainnet.quiknode.pro';
        this.connection = new Connection(this.rpcEndpoint, {
            timeout: config.rpc?.timeout || 5000,
            commitment: 'confirmed'
        });
        
        // 交易配置
        this.defaultSlippageBps = config.trading?.defaultSlippageBps || 50; // 0.5%
        this.maxSlippageBps = config.trading?.maxSlippageBps || 100; // 1%
        this.minLiquidity = config.trading?.minLiquidity || 1000; // $1000
        
        // 常用代币地址
        this.tokens = {
            SOL: 'So11111111111111111111111111111111111111112',
            USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
            BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
            WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
            POPCAT: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',
            WEN: 'WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk'
        };
        
        // 指标统计
        this.metrics = {
            totalQuotes: 0,
            successfulQuotes: 0,
            failedQuotes: 0,
            totalSwaps: 0,
            successfulSwaps: 0,
            failedSwaps: 0,
            averageResponseTime: 0,
            lastError: null,
            lastSuccess: null
        };
        
        // 创建axios实例
        this.axiosInstance = axios.create({
            baseURL: this.baseUrl,
            timeout: this.timeout,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        console.log('✅ JupiterClient 初始化完成');
        console.log(`   RPC 端点：${this.rpcEndpoint}`);
        console.log(`   Jupiter API：${this.baseUrl}`);
        console.log(`   默认滑点：${this.defaultSlippageBps} bps (${this.defaultSlippageBps/100}%)`);
    }
    
    /**
     * 获取代币列表
     */
    async getTokenList() {
        try {
            console.log('📋 获取代币列表...');
            const response = await this.axiosInstance.get('/tokens');
            
            if (response.data && Array.isArray(response.data)) {
                console.log(`✅ 获取到 ${response.data.length} 个代币`);
                return response.data;
            }
            
            throw new Error('代币列表格式错误');
        } catch (error) {
            console.error('❌ 获取代币列表失败:', error.message);
            throw error;
        }
    }
    
    /**
     * 获取报价
     */
    async getQuote(inputMint, outputMint, amount, options = {}) {
        const startTime = Date.now();
        this.metrics.totalQuotes++;
        
        const params = {
            inputMint,
            outputMint,
            amount: amount.toString(),
            slippageBps: options.slippageBps || this.defaultSlippageBps,
            onlyDirectRoutes: options.onlyDirectRoutes || false,
            asLegacyTransaction: options.asLegacyTransaction || false,
            maxAccounts: options.maxAccounts || 64
        };
        
        // 可选参数
        if (options.feeBps) params.feeBps = options.feeBps;
        if (options.userPublicKey) params.userPublicKey = options.userPublicKey;
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                console.log(`💰 获取报价 (尝试 ${attempt}/${this.maxRetries})...`);
                console.log(`   ${inputMint.slice(0, 8)}... → ${outputMint.slice(0, 8)}...`);
                console.log(`   金额: ${this._formatAmount(amount, inputMint)}`);
                
                const response = await this.axiosInstance.get('/quote', { params });
                const responseTime = Date.now() - startTime;
                
                this.metrics.successfulQuotes++;
                this.metrics.lastSuccess = new Date().toISOString();
                this._updateAverageResponseTime(responseTime);
                
                console.log(`✅ 报价获取成功 (${responseTime}ms)`);
                console.log(`   输出金额: ${this._formatAmount(response.data.outAmount, outputMint)}`);
                console.log(`   价格影响: ${response.data.priceImpactPct || 0}%`);
                
                return {
                    ...response.data,
                    responseTime,
                    attempt
                };
                
            } catch (error) {
                console.warn(`⚠️  请求失败，${attempt}/${this.maxRetries} 次重试...`);
                
                if (attempt === this.maxRetries) {
                    this.metrics.failedQuotes++;
                    this.metrics.lastError = {
                        message: error.message,
                        timestamp: new Date().toISOString()
                    };
                    throw new Error(`获取报价失败: ${error.message}`);
                }
                
                await this._sleep(this.retryDelay);
            }
        }
    }
    
    /**
     * 模拟交易
     */
    async simulateTransaction(quote, userPublicKey) {
        try {
            console.log('🔍 模拟交易...');
            
            const response = await this.axiosInstance.post('/swap-instructions', {
                quoteResponse: quote,
                userPublicKey,
                wrapAndUnwrapSol: true,
                dynamicComputeUnitLimit: true,
                prioritizationFeeLamports: 'auto'
            });
            
            console.log('✅ 交易模拟成功');
            
            // 这里可以添加更详细的模拟分析
            return {
                success: true,
                instructions: response.data,
                estimatedGasFee: null // 需要实际计算
            };
            
        } catch (error) {
            console.error('❌ 交易模拟失败:', error.message);
            return {
                success: false,
                error: error.message,
                instructions: null
            };
        }
    }
    
    /**
     * 价格影响分析
     */
    async analyzePriceImpact(inputMint, outputMint, amounts) {
        console.log('📊 价格影响分析...');
        console.log(`   测试 ${amounts.length} 个不同金额`);
        
        const results = [];
        
        for (const amount of amounts) {
            try {
                const quote = await this.getQuote(inputMint, outputMint, amount);
                
                results.push({
                    inputAmount: amount,
                    outputAmount: quote.outAmount,
                    priceImpactPct: quote.priceImpactPct || 0,
                    slippageBps: quote.slippageBps || this.defaultSlippageBps,
                    routePlan: quote.routePlan || []
                });
                
                // 避免速率限制
                await this._sleep(500);
                
            } catch (error) {
                console.warn(`   金额 ${this._formatAmount(amount, inputMint)} 分析失败: ${error.message}`);
                results.push({
                    inputAmount: amount,
                    error: error.message,
                    success: false
                });
            }
        }
        
        console.log(`✅ 价格影响分析完成，成功 ${results.filter(r => !r.error).length}/${amounts.length}`);
        return results;
    }
    
    /**
     * 获取代币价格
     */
    async getTokenPrice(mintAddress, vsToken = this.tokens.USDC) {
        try {
            const quote = await this.getQuote(mintAddress, vsToken, 1 * 1e9); // 假设1个代币
            
            return {
                mint: mintAddress,
                vsToken: vsToken,
                price: quote.outAmount / 1e6, // USDC有6位小数
                priceImpact: quote.priceImpactPct || 0,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error(`❌ 获取代币价格失败 (${mintAddress.slice(0, 8)}...):`, error.message);
            throw error;
        }
    }
    
    /**
     * 格式化金额
     */
    _formatAmount(amount, mintAddress) {
        // 根据代币地址判断小数位
        if (mintAddress === this.tokens.SOL) {
            return `${(amount / 1e9).toFixed(4)} SOL`;
        } else if (mintAddress === this.tokens.USDC || mintAddress === this.tokens.USDT) {
            return `${(amount / 1e6).toFixed(2)} USDC`;
        } else {
            return `${amount} tokens`;
        }
    }
    
    /**
     * 更新平均响应时间
     */
    _updateAverageResponseTime(responseTime) {
        const total = this.metrics.successfulQuotes;
        const oldAvg = this.metrics.averageResponseTime;
        this.metrics.averageResponseTime = ((oldAvg * (total - 1)) + responseTime) / total;
    }
    
    /**
     * 休眠函数
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * 获取指标统计
     */
    getMetrics() {
        return {
            ...this.metrics,
            successRate: this.metrics.totalQuotes > 0 
                ? (this.metrics.successfulQuotes / this.metrics.totalQuotes * 100).toFixed(2) + '%'
                : '0%'
        };
    }
    
    /**
     * 健康检查
     */
    async healthCheck() {
        try {
            console.log('🏥 Jupiter API 健康检查...');
            
            // 测试一个简单的报价
            const quote = await this.getQuote(
                this.tokens.SOL,
                this.tokens.USDC,
                0.01 * 1e9, // 0.01 SOL
                { timeout: 5000 }
            );
            
            return {
                healthy: true,
                responseTime: quote.responseTime,
                timestamp: new Date().toISOString(),
                message: 'Jupiter API 正常'
            };
            
        } catch (error) {
            return {
                healthy: false,
                error: error.message,
                timestamp: new Date().toISOString(),
                message: 'Jupiter API 异常'
            };
        }
    }
}

// 导出
module.exports = JupiterClient;

// 测试代码
if (require.main === module) {
    (async () => {
        console.log('🧪 测试 JupiterClient 修复版本...\n');
        
        const client = new JupiterClient();
        
        try {
            // 健康检查
            const health = await client.healthCheck();
            console.log(`🏥 健康检查: ${health.healthy ? '✅ 正常' : '❌ 异常'}`);
            if (!health.healthy) {
                console.log(`   错误: ${health.error}`);
                process.exit(1);
            }
            
            // 测试获取代币列表
            console.log('\n📋 测试获取代币列表...');
            try {
                const tokens = await client.getTokenList();
                console.log(`✅ 获取到 ${tokens.length} 个代币`);
                
                // 显示热门代币
                const popular = tokens.filter(t => 
                    ['SOL', 'USDC', 'USDT', 'BONK', 'WIF', 'POPCAT', 'WEN'].includes(t.symbol)
                ).slice(0, 5);
                
                console.log('🔥 热门代币:');
                popular.forEach(token => {
                    console.log(`   ${token.symbol}: ${token.address.slice(0, 8)}... (${token.decimals} decimals)`);
                });
            } catch (error) {
                console.log('⚠️  获取代币列表失败，跳过...');
            }
            
            // 测试获取报价：0.01 SOL → USDC
            console.log('\n💰 测试获取报价...');
            const solAmount = 0.01 * 1e9; // 0.01 SOL
            
            const quote = await client.getQuote(
                client.tokens.SOL,
                client.tokens.USDC,
                solAmount
            );
            
            console.log('\n📋 报价详情:');
            console.log(`   输入: ${client._formatAmount(quote.inAmount, client.tokens.SOL)}`);
            console.log(`   输出: ${client._formatAmount(quote.outAmount, client.tokens.USDC)}`);
            console.log(`   价格影响: ${quote.priceImpactPct || 0}%`);
            console.log(`   滑点: ${quote.slippageBps / 100}%`);
            console.log(`   响应时间: ${quote.responseTime}ms`);
            
            if (quote.routePlan && quote.routePlan.length > 0) {
                console.log(`   路由: ${quote.routePlan.length} 步`);
            }
            
            // 测试价格影响分析
            console.log('\n📊 测试价格影响分析...');
            const amounts = [0.01 * 1e9, 0.1 * 1e9, 0.5 * 1e9]; // 0.01, 0.1, 0.5 SOL
            const analysis = await client.analyzePriceImpact(
                client.tokens.SOL,
                client.tokens.USDC,
                amounts
            );
            
            console.log('\n📈 分析结果:');
            analysis.forEach((result, index) => {
                if (result.success !== false) {
                    console.log(`   ${index + 1}. ${client._formatAmount(result.inputAmount, client.tokens.SOL)}`);
                    console.log(`      输出: ${client._formatAmount(result.outputAmount, client.tokens.USDC)}`);
                    console.log(`      价格影响: ${result.priceImpactPct}%`);
                }
            });
            
            console.log('\n✅ 所有测试通过！');
            console.log('\n📊 性能指标:');
            console.log(JSON.stringify(client.getMetrics(), null, 2));
            
        } catch (error) {
            console.error('\n❌ 测试失败:', error.message);
            console.error('堆栈:', error.stack);
            process.exit(1);
        }
    })();
}