#!/usr/bin/env node
/**
 * Jupiter API 客户端
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
 */

const axios = require('axios');
const { Connection, PublicKey, VersionedTransaction } = require('@solana/web3.js');

class JupiterClient {
    constructor(config = {}) {
        // Jupiter API 配置
        this.baseUrl = config.jupiter?.baseUrl || 'https://api.jup.ag';
        this.apiKey = config.jupiter?.apiKey || '';
        this.timeout = config.jupiter?.timeout || 10000;
        this.maxRetries = config.jupiter?.maxRetries || 3;
        this.retryDelay = config.jupiter?.retryDelay || 1000;
        
        // 端点配置 - 使用配置中的端点或默认值
        if (config.jupiter?.metisApi?.endpoints) {
            // 使用配置中的metisApi端点
            this.endpoints = {
                quote: config.jupiter.metisApi.endpoints.quote || '/swap/v1/quote',
                swap: config.jupiter.metisApi.endpoints.swap || '/swap/v1/swap',
                tokens: config.jupiter.tokensApi?.endpoints?.search || '/tokens/v2/search',
                price: config.jupiter.priceApi?.endpoints?.price || '/price/v3'
            };
        } else {
            // 默认端点
            this.endpoints = {
                quote: '/swap/v1/quote',
                swap: '/swap/v1/swap',
                tokens: '/tokens/v2/search',
                price: '/price/v3'
            };
        }
        
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
            BUSD: '5RpUwQ8wtdPCZHhu6MERp2RGrpobsbZ6MH5dDHkUjs2'
        };
        
        // 指标统计
        this.metrics = {
            totalQuotes: 0,
            successfulQuotes: 0,
            failedQuotes: 0,
            averageResponseTime: 0,
            lastQuoteTime: null
        };
        
        // 创建axios实例
        this.axiosInstance = axios.create({
            baseURL: this.baseUrl,
            timeout: this.timeout,
            headers: {
                'Accept': 'application/json',
                'x-api-key': this.apiKey
            }
        });
        
        console.log('✅ JupiterClient 初始化完成');
        console.log(`   RPC 端点：${this.rpcEndpoint}`);
        console.log(`   默认滑点：${this.defaultSlippageBps} bps (${this.defaultSlippageBps / 100}%)`);
        console.log(`   最大滑点：${this.maxSlippageBps} bps (${this.maxSlippageBps / 100}%)`);
    }
    
    /**
     * 获取交易报价
     * 
     * @param {string} inputMint 输入代币地址
     * @param {string} outputMint 输出代币地址
     * @param {number} amount 输入数量（最小单位）
     * @param {number} slippageBps 滑点（基点，1bp = 0.01%）
     * @returns {Promise<Object>} 报价信息
     */
    async getQuote(inputMint, outputMint, amount, slippageBps = this.defaultSlippageBps) {
        const startTime = Date.now();
        this.metrics.totalQuotes++;
        
        // 验证滑点
        if (slippageBps > this.maxSlippageBps) {
            throw new Error(`滑点过大：${slippageBps} bps，最大允许 ${this.maxSlippageBps} bps`);
        }
        
        const params = new URLSearchParams({
            inputMint,
            outputMint,
            amount: amount.toString(),
            slippageBps: slippageBps.toString(),
            onlyDirectRoutes: 'false',
            asLegacyTransaction: 'false',
            restrictIntermediateTokens: 'true' // 只使用可靠的中间代币
        });
        
        const url = `${this.baseUrl}${this.endpoints.quote}?${params}`;
        
        try {
            const response = await this._withRetry(() => 
                axios.get(url, {
                    timeout: this.timeout,
                    headers: {
                        'Accept': 'application/json',
                        'x-api-key': this.apiKey
                    }
                })
            );
            
            const quote = response.data;
            const responseTime = Date.now() - startTime;
            
            // 更新指标
            this.metrics.successfulQuotes++;
            this.metrics.lastQuoteTime = new Date().toISOString();
            this._updateAverageResponseTime(responseTime);
            
            // 验证报价
            this._validateQuote(quote);
            
            // 计算附加信息
            const enhancedQuote = {
                ...quote,
                priceImpact: this._calculatePriceImpact(quote),
                effectivePrice: Number(quote.outAmount) / Number(quote.inAmount),
                routePath: this._formatRoutePath(quote.routePlan),
                responseTime,
                timestamp: new Date().toISOString()
            };
            
            console.log(`📊 报价获取成功 (${responseTime}ms)`);
            console.log(`   路径：${enhancedQuote.routePath}`);
            console.log(`   价格影响：${(enhancedQuote.priceImpact * 100).toFixed(4)}%`);
            console.log(`   预期输出：${this._formatAmount(enhancedQuote.outAmount, outputMint)}`);
            
            return enhancedQuote;
            
        } catch (error) {
            this.metrics.failedQuotes++;
            console.error('❌ 报价获取失败:', error.message);
            throw error;
        }
    }
    
    /**
     * 获取交换指令
     * 
     * @param {Object} quoteResponse 报价响应
     * @param {string} userPublicKey 用户公钥
     * @returns {Promise<Object>} 交易指令
     */
    async getSwapInstruction(quoteResponse, userPublicKey) {
        try {
            const response = await this._withRetry(() =>
                axios.post(`${this.baseUrl}${this.endpoints.swap}`, {
                    quoteResponse,
                    userPublicKey,
                    wrapAndUnwrapSol: true,
                    dynamicComputeUnitLimit: true,
                    prioritizationFeeLamports: 'auto' // 自动计算优先费
                }, {
                    timeout: this.timeout,
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'x-api-key': this.apiKey
                    }
                })
            );
            
            const swapData = response.data;
            
            console.log('✅ 交换指令生成成功');
            console.log(`   模拟费用：${swapData.simulationError ? '❌ 模拟失败' : '✅ 模拟成功'}`);
            console.log(`   优先费：${swapData.prioritizationFeeLamports || 'auto'} lamports`);
            
            return swapData;
            
        } catch (error) {
            console.error('❌ 交换指令生成失败:', error.message);
            throw error;
        }
    }
    
    /**
     * 获取代币列表
     * 
     * @returns {Promise<Array>} 代币列表
     */
    async getTokenList() {
        try {
            const response = await this._withRetry(() =>
                axios.get(`${this.baseUrl}${this.endpoints.tokens}`, {
                    timeout: this.timeout,
                    headers: {
                        'Accept': 'application/json'
                    }
                })
            );
            
            console.log(`✅ 获取代币列表成功，共 ${Object.keys(response.data).length} 个代币`);
            return response.data;
            
        } catch (error) {
            console.error('❌ 获取代币列表失败:', error.message);
            throw error;
        }
    }
    
    /**
     * 分析价格影响
     * 
     * @param {Object} quote 报价对象
     * @returns {Promise<Object>} 价格影响分析
     */
    async analyzePriceImpact(quote) {
        try {
            // 这里可以添加更复杂的价格影响分析逻辑
            // 比如对比多个DEX的价格，计算滑点影响等
            
            const priceImpact = this._calculatePriceImpact(quote);
            const priceImpactPercent = priceImpact * 100;
            
            const analysis = {
                priceImpact: priceImpact,
                priceImpactPercent: priceImpactPercent,
                severity: this._getPriceImpactSeverity(priceImpactPercent),
                recommendation: this._getPriceImpactRecommendation(priceImpactPercent),
                timestamp: new Date().toISOString()
            };
            
            console.log(`📊 价格影响分析：${priceImpactPercent.toFixed(4)}% (${analysis.severity})`);
            console.log(`   建议：${analysis.recommendation}`);
            
            return analysis;
            
        } catch (error) {
            console.error('❌ 价格影响分析失败:', error.message);
            throw error;
        }
    }
    
    /**
     * 模拟交易
     * 
     * @param {string} swapTransaction Base64 编码的交易
     * @returns {Promise<Object>} 模拟结果
     */
    async simulateTransaction(swapTransaction) {
        try {
            const simulation = await this.connection.simulateTransaction(
                VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64')),
                {
                    sigVerify: false,
                    replaceRecentBlockhash: true,
                    commitment: 'processed'
                }
            );
            
            const result = {
                success: !simulation.value.err,
                error: simulation.value.err,
                logs: simulation.value.logs,
                unitsConsumed: simulation.value.unitsConsumed,
                computeUnits: simulation.value.unitsConsumed
            };
            
            if (result.success) {
                console.log('✅ 交易模拟成功');
                console.log(`   消耗计算单元：${result.unitsConsumed}`);
            } else {
                console.error('❌ 交易模拟失败:', result.error);
            }
            
            return result;
            
        } catch (error) {
            console.error('❌ 交易模拟异常:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * 计算价格影响
     * 
     * @param {Object} quote 报价对象
     * @returns {number} 价格影响（0-1 之间）
     */
    _calculatePriceImpact(quote) {
        // Jupiter API 已经提供 priceImpactBps
        if (quote.priceImpactBps) {
            return Number(quote.priceImpactBps) / 10000;
        }
        
        // 如果没有提供，使用简化的计算方法
        // 实际应该对比市场中间价
        return 0;
    }
    
    /**
     * 格式化交易路径
     */
    _formatRoutePath(routePlan) {
        if (!routePlan || routePlan.length === 0) {
            return '直接交易';
        }
        
        return routePlan.map(step => {
            const poolLabel = step.swapInfo?.label || step.amendKey || 'Unknown';
            return poolLabel;
        }).join(' → ');
    }
    
    /**
     * 验证报价有效性
     */
    _validateQuote(quote) {
        if (!quote.inAmount || !quote.outAmount) {
            throw new Error('报价无效：缺少输入或输出金额');
        }
        
        if (quote.outAmount === '0') {
            throw new Error('报价无效：输出金额为 0');
        }
        
        if (quote.priceImpactBps && Number(quote.priceImpactBps) > 1000) {
            console.warn('⚠️  警告：价格影响过大 (>10%)');
        }
    }
    
    /**
     * 格式化金额显示
     */
    _formatAmount(amount, mint) {
        const numAmount = Number(amount);
        
        // SOL 和封装 SOL
        if (mint === this.tokens.SOL || mint === 'So11111111111111111111111111111111111111112') {
            return `${(numAmount / 1e9).toFixed(6)} SOL`;
        }
        
        // USDC, USDT (6 位小数)
        if (mint === this.tokens.USDC || mint === this.tokens.USDT) {
            return `$${(numAmount / 1e6).toFixed(2)}`;
        }
        
        // 其他代币
        return numAmount.toString();
    }
    
    /**
     * 获取价格影响严重程度
     */
    _getPriceImpactSeverity(priceImpactPercent) {
        if (priceImpactPercent < 0.1) return '极低';
        if (priceImpactPercent < 0.5) return '低';
        if (priceImpactPercent < 1.0) return '中等';
        if (priceImpactPercent < 2.0) return '高';
        return '极高';
    }
    
    /**
     * 获取价格影响建议
     */
    _getPriceImpactRecommendation(priceImpactPercent) {
        if (priceImpactPercent < 0.1) return '安全，可以交易';
        if (priceImpactPercent < 0.5) return '较安全，建议小额交易';
        if (priceImpactPercent < 1.0) return '风险中等，建议分批交易';
        if (priceImpactPercent < 2.0) return '风险较高，建议等待流动性改善';
        return '风险极高，不建议交易';
    }
    
    /**
     * 带重试的 API 调用
     */
    async _withRetry(fn, retries = 0) {
        try {
            return await fn();
        } catch (error) {
            if (retries < this.maxRetries) {
                console.log(`⚠️  请求失败，${retries + 1}/${this.maxRetries} 次重试...`);
                await this._sleep(this.retryDelay * (retries + 1));
                return this._withRetry(fn, retries + 1);
            }
            throw error;
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
}

// 导出
module.exports = JupiterClient;

// 测试代码
if (require.main === module) {
    (async () => {
        console.log('🧪 测试 JupiterClient...\n');
        
        const client = new JupiterClient();
        
        try {
            // 测试获取报价：1 SOL → USDC
            const solAmount = 1 * 1e9; // 1 SOL
            console.log(`📊 请求报价：1 SOL → USDC\n`);
            
            const quote = await client.getQuote(
                client.tokens.SOL,
                client.tokens.USDC,
                solAmount
            );
            
            console.log('\n📋 报价详情:');
            console.log(JSON.stringify({
                inAmount: client._formatAmount(quote.inAmount, client.tokens.SOL),
                outAmount: client._formatAmount(quote.outAmount, client.tokens.USDC),
                priceImpact: (quote.priceImpact * 100).toFixed(4) + '%',
                routePath: quote.routePath,
                responseTime: quote.responseTime + 'ms'
            }, null, 2));
            
            console.log('\n✅ 测试成功！');
            
        } catch (error) {
            console.error('\n❌ 测试失败:', error.message);
        }
    })();
}
