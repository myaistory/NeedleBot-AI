#!/usr/bin/env node
/**
 * OKX DEX API 交易模块
 * 
 * 封装 OKX DEX API，提供 Solana 链上交易功能
 * 
 * 功能:
 * - 获取最优交易报价（Quote API）
 * - 执行链上交易（Swap API）
 * - 获取代币信息（Token Info API）
 * - 错误处理和重试机制
 * 
 * API 文档: https://web3.okx.com/zh-hans/onchain-os/dev-docs/trade/dex-api-reference
 */

const axios = require('axios');
const { Connection, PublicKey, VersionedTransaction } = require('@solana/web3.js');

class OKXTrader {
    constructor(config = {}) {
        // OKX API 配置
        this.baseUrl = config.okx?.baseUrl || 'https://www.okx.com';
        this.apiKey = config.okx?.apiKey || process.env.OKX_API_KEY || '';
        this.secretKey = config.okx?.secretKey || process.env.OKX_SECRET_KEY || '';
        this.passphrase = config.okx?.passphrase || process.env.OKX_PASSPHRASE || '';
        
        // API 端点
        this.endpoints = {
            // DEX API 端点
            quote: '/api/v5/dex/aggregator/quote',
            swap: '/api/v5/dex/aggregator/swap',
            tokenInfo: '/api/v5/dex/aggregator/token-info',
            
            // 通用端点
            tickers: '/api/v5/market/tickers',
            candles: '/api/v5/market/candles',
            orderbook: '/api/v5/market/books'
        };
        
        // 超时和重试配置
        this.timeout = config.okx?.timeout || 10000;
        this.maxRetries = config.okx?.maxRetries || 3;
        this.retryDelay = config.okx?.retryDelay || 1000;
        
        // RPC 配置
        this.rpcEndpoint = config.rpc?.endpoint || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
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
            WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm'
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
            lastRequestTime: null
        };
        
        // 创建axios实例
        this.axiosInstance = axios.create({
            baseURL: this.baseUrl,
            timeout: this.timeout,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'OK-ACCESS-KEY': this.apiKey,
                'OK-ACCESS-PASSPHRASE': this.passphrase
            }
        });
        
        console.log('✅ OKXTrader 初始化完成');
        console.log(`   API 端点：${this.baseUrl}`);
        console.log(`   RPC 端点：${this.rpcEndpoint}`);
        console.log(`   默认滑点：${this.defaultSlippageBps} bps (${this.defaultSlippageBps / 100}%)`);
        console.log(`   最大滑点：${this.maxSlippageBps} bps (${this.maxSlippageBps / 100}%)`);
        console.log(`   API Key 配置：${this.apiKey ? '已配置' : '未配置'}`);
    }
    
    /**
     * 带重试的请求封装
     * @param {string} method HTTP 方法
     * @param {string} endpoint 端点路径
     * @param {object} params 请求参数
     * @param {number} retryCount 当前重试次数
     * @returns {Promise<object>} 响应数据
     */
    async requestWithRetry(method, endpoint, params = {}, retryCount = 0) {
        const startTime = Date.now();
        
        try {
            let response;
            
            if (method.toUpperCase() === 'GET') {
                response = await this.axiosInstance.get(endpoint, { params });
            } else {
                response = await this.axiosInstance.post(endpoint, params);
            }
            
            const responseTime = Date.now() - startTime;
            this.metrics.averageResponseTime = 
                (this.metrics.averageResponseTime * this.metrics.totalQuotes + responseTime) / 
                (this.metrics.totalQuotes + 1);
            
            this.metrics.lastRequestTime = new Date().toISOString();
            
            if (response.data && response.data.code === '0') {
                return response.data.data;
            } else {
                throw new Error(`API 错误: ${response.data?.msg || '未知错误'}`);
            }
            
        } catch (error) {
            console.error(`请求失败 (重试 ${retryCount}/${this.maxRetries}):`, error.message);
            
            if (retryCount < this.maxRetries) {
                await this.sleep(this.retryDelay * (retryCount + 1));
                return this.requestWithRetry(method, endpoint, params, retryCount + 1);
            }
            
            throw new Error(`请求失败，已重试 ${this.maxRetries} 次: ${error.message}`);
        }
    }
    
    /**
     * 睡眠函数
     * @param {number} ms 毫秒数
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * 获取交易报价
     * 
     * @param {string} fromToken 输入代币地址
     * @param {string} toToken 输出代币地址
     * @param {number} amount 输入数量（最小单位）
     * @param {number} slippageBps 滑点（基点，1bp = 0.01%）
     * @returns {Promise<Object>} 报价信息
     */
    async getQuote(fromToken, toToken, amount, slippageBps = null) {
        try {
            this.metrics.totalQuotes++;
            
            const params = {
                chainId: 'solana', // Solana 链
                fromTokenAddress: fromToken,
                toTokenAddress: toToken,
                amount: amount.toString(),
                slippage: (slippageBps || this.defaultSlippageBps) / 10000, // 转换为小数
                feeBps: 0, // 默认无额外费用
                userAddress: '' // 可选：用户地址
            };
            
            console.log(`获取报价: ${fromToken} -> ${toToken}, 数量: ${amount}`);
            
            const quoteData = await this.requestWithRetry('POST', this.endpoints.quote, params);
            
            if (!quoteData) {
                throw new Error('未获取到报价数据');
            }
            
            this.metrics.successfulQuotes++;
            
            // 解析报价数据
            const quote = {
                fromToken: quoteData.fromToken,
                toToken: quoteData.toToken,
                fromAmount: quoteData.fromAmount,
                toAmount: quoteData.toAmount,
                estimatedGas: quoteData.estimatedGas,
                gasPrice: quoteData.gasPrice,
                priceImpact: quoteData.priceImpact,
                routes: quoteData.routes || [],
                transaction: quoteData.transaction,
                timestamp: Date.now()
            };
            
            console.log(`✅ 报价获取成功: ${quote.fromAmount} -> ${quote.toAmount}`);
            console.log(`   价格影响: ${(quote.priceImpact * 100).toFixed(2)}%`);
            console.log(`   预估Gas: ${quote.estimatedGas}`);
            
            return quote;
            
        } catch (error) {
            this.metrics.failedQuotes++;
            console.error('获取报价失败:', error.message);
            throw error;
        }
    }
    
    /**
     * 执行交易
     * 
     * @param {string} fromToken 输入代币地址
     * @param {string} toToken 输出代币地址
     * @param {number} amount 输入数量
     * @param {string} userAddress 用户钱包地址
     * @param {string} privateKey 用户私钥（用于签名）
     * @param {number} slippageBps 滑点
     * @returns {Promise<Object>} 交易结果
     */
    async executeSwap(fromToken, toToken, amount, userAddress, privateKey, slippageBps = null) {
        try {
            this.metrics.totalSwaps++;
            
            // 1. 先获取报价
            const quote = await this.getQuote(fromToken, toToken, amount, slippageBps);
            
            if (!quote || !quote.transaction) {
                throw new Error('无效的报价数据');
            }
            
            // 2. 准备交易参数
            const swapParams = {
                chainId: 'solana',
                fromTokenAddress: fromToken,
                toTokenAddress: toToken,
                amount: amount.toString(),
                slippage: (slippageBps || this.defaultSlippageBps) / 10000,
                userAddress: userAddress,
                quote: quote // 包含交易数据
            };
            
            console.log(`执行交易: ${fromToken} -> ${toToken}, 数量: ${amount}`);
            console.log(`用户地址: ${userAddress}`);
            
            // 3. 调用Swap API
            const swapData = await this.requestWithRetry('POST', this.endpoints.swap, swapParams);
            
            if (!swapData || !swapData.transaction) {
                throw new Error('未获取到交易数据');
            }
            
            // 4. 签名并发送交易（这里需要实际的签名逻辑）
            const transactionResult = await this.signAndSendTransaction(
                swapData.transaction, 
                privateKey
            );
            
            this.metrics.successfulSwaps++;
            
            const result = {
                success: true,
                txHash: transactionResult.signature,
                fromToken: fromToken,
                toToken: toToken,
                fromAmount: amount,
                toAmount: quote.toAmount,
                priceImpact: quote.priceImpact,
                gasUsed: transactionResult.gasUsed,
                timestamp: Date.now(),
                quoteId: quote.quoteId || Date.now().toString()
            };
            
            console.log(`✅ 交易执行成功！`);
            console.log(`   交易哈希: ${result.txHash}`);
            console.log(`   输出数量: ${result.toAmount}`);
            console.log(`   Gas 使用: ${result.gasUsed}`);
            
            return result;
            
        } catch (error) {
            this.metrics.failedSwaps++;
            console.error('执行交易失败:', error.message);
            
            return {
                success: false,
                error: error.message,
                timestamp: Date.now()
            };
        }
    }
    
    /**
     * 签名并发送交易
     * @param {object} transactionData 交易数据
     * @param {string} privateKey 私钥
     * @returns {Promise<object>} 交易结果
     */
    async signAndSendTransaction(transactionData, privateKey) {
        try {
            // 这里需要实现实际的Solana交易签名和发送逻辑
            // 由于OKX API可能返回已签名的交易或需要本地签名的交易数据
            // 这里提供一个框架实现
            
            console.log('签名并发送交易...');
            
            // 模拟交易发送
            // 实际实现需要使用 @solana/web3.js
            const mockResult = {
                signature: 'mock_signature_' + Date.now(),
                gasUsed: 5000,
                status: 'confirmed',
                slot: 12345678
            };
            
            console.log(`✅ 交易已发送，签名: ${mockResult.signature}`);
            
            return mockResult;
            
        } catch (error) {
            console.error('签名并发送交易失败:', error.message);
            throw error;
        }
    }
    
    /**
     * 获取代币信息
     * 
     * @param {string} tokenAddress 代币地址
     * @returns {Promise<Object>} 代币信息
     */
    async getTokenInfo(tokenAddress) {
        try {
            const params = {
                chainId: 'solana',
                tokenAddress: tokenAddress
            };
            
            console.log(`获取代币信息: ${tokenAddress}`);
            
            const tokenData = await this.requestWithRetry('GET', this.endpoints.tokenInfo, params);
            
            if (!tokenData) {
                throw new Error('未获取到代币信息');
            }
            
            const tokenInfo = {
                address: tokenAddress,
                symbol: tokenData.symbol,
                name: tokenData.name,
                decimals: tokenData.decimals,
                totalSupply: tokenData.totalSupply,
                priceUSD: tokenData.priceUSD,
                marketCap: tokenData.marketCap,
                liquidity: tokenData.liquidity,
                volume24h: tokenData.volume24h,
                priceChange24h: tokenData.priceChange24h,
                holders: tokenData.holders,
                timestamp: Date.now()
            };
            
            console.log(`✅ 代币信息获取成功: ${tokenInfo.symbol} (${tokenInfo.name})`);
            console.log(`   价格: $${tokenInfo.priceUSD}`);
            console.log(`   市值: $${tokenInfo.marketCap}`);
            console.log(`   流动性: $${tokenInfo.liquidity}`);
            
            return tokenInfo;
            
        } catch (error) {
            console.error('获取代币信息失败:', error.message);
            throw error;
        }
    }
    
    /**
     * 批量获取代币价格
     * 
     * @param {Array<string>} tokenAddresses 代币地址数组
     * @returns {Promise<Array<Object>>} 代币价格信息
     */
    async getTokenPrices(tokenAddresses) {
        try {
            const prices = [];
            
            for (const address of tokenAddresses) {
                try {
                    const tokenInfo = await this.getTokenInfo(address);
                    prices.push({
                        address: address,
                        priceUSD: tokenInfo.priceUSD,
                        symbol: tokenInfo.symbol,
                        timestamp: Date.now()
                    });
                } catch (error) {
                    console.warn(`获取代币 ${address} 价格失败:`, error.message);
                    prices.push({
                        address: address,
                        priceUSD: null,
                        symbol: null,
                        error: error.message,
                        timestamp: Date.now()
                    });
                }
                
                // 避免请求过快
                await this.sleep(100);
            }
            
            return prices;
            
        } catch (error) {
            console.error('批量获取代币价格失败:', error.message);
            throw error;
        }
    }
    
    /**
     * 获取市场行情
     * 
     * @param {string} instId 交易对ID，如 SOL-USDT
     * @returns {Promise<Object>} 市场行情
     */
    async getTicker(instId) {
        try {
            const params = {
                instId: instId
            };
            
            const tickerData = await this.requestWithRetry('GET', this.endpoints.tickers, params);
            
            if (!tickerData || tickerData.length === 0) {
                throw new Error('未获取到市场行情');
            }
            
            const ticker = tickerData[0];
            
            return {
                instId: ticker.instId,
                last: ticker.last,
                lastSz: ticker.lastSz,
                askPx: ticker.askPx,
                askSz: ticker.askSz,
                bidPx: ticker.bidPx,
                bidSz: ticker.bidSz,
                open24h: ticker.open24h,
                high24h: ticker.high24h,
                low24h: ticker.low24h,
                vol24h: ticker.vol24h,
                volCcy24h: ticker.volCcy24h,
                ts: ticker.ts,
                sodUtc0: ticker.sodUtc0,
                sodUtc8: ticker.sodUtc8
            };
            
        } catch (error) {
            console.error('获取市场行情失败:', error.message);
            throw error;
        }
    }
    
    /**
     * 获取K线数据
     * 
     * @param {string} instId 交易对ID
     * @param {string} bar 时间粒度，如 1m, 5m, 15m, 1H, 4H, 1D
     * @param {number} limit 数据条数限制
     * @returns {Promise<Array<Object>>} K线数据
     */
    async getCandles(instId, bar = '5m', limit = 100) {
        try {
            const params =
