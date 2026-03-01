#!/usr/bin/env node
/**
 * Orca API 客户端
 * 
 * 集成 Orca DEX API 进行 Solana 链上交易
 * 
 * 功能:
 * - 获取代币价格和流动性信息
 * - 获取交易报价
 * - 获取池子信息
 * - 价格影响分析
 * 
 * API 文档: https://docs.orca.so/
 */

const axios = require('axios');
const { Connection, PublicKey } = require('@solana/web3.js');

class OrcaClient {
    constructor(config = {}) {
        // Orca API 配置
        this.baseUrl = config.orca?.baseUrl || 'https://api.orca.so';
        this.timeout = config.orca?.timeout || 10000;
        this.maxRetries = config.orca?.maxRetries || 3;
        this.retryDelay = config.orca?.retryDelay || 1000;
        
        // RPC 配置
        this.rpcEndpoint = config.rpc?.endpoint || 'https://purple-wiser-tab.solana-mainnet.quiknode.pro';
        this.connection = new Connection(this.rpcEndpoint, {
            timeout: config.rpc?.timeout || 5000,
            commitment: 'confirmed'
        });
        
        // 常用代币地址
        this.tokens = {
            SOL: 'So11111111111111111111111111111111111111112',
            USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
            BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
            WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
            ORCA: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE'
        };
        
        // 代币元数据
        this.tokenMetadata = {
            [this.tokens.SOL]: { symbol: 'SOL', decimals: 9, name: 'Solana' },
            [this.tokens.USDC]: { symbol: 'USDC', decimals: 6, name: 'USD Coin' },
            [this.tokens.USDT]: { symbol: 'USDT', decimals: 6, name: 'Tether USD' },
            [this.tokens.BONK]: { symbol: 'BONK', decimals: 5, name: 'Bonk' },
            [this.tokens.WIF]: { symbol: 'WIF', decimals: 6, name: 'dogwifhat' },
            [this.tokens.ORCA]: { symbol: 'ORCA', decimals: 6, name: 'Orca' }
        };
        
        // 指标统计
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
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
        
        console.log('✅ OrcaClient 初始化完成');
        console.log(`   RPC 端点：${this.rpcEndpoint}`);
        console.log(`   Orca API：${this.baseUrl}`);
    }
    
    /**
     * 获取代币价格
     */
    async getTokenPrice(mintAddress, vsToken = this.tokens.USDC) {
        const startTime = Date.now();
        this.metrics.totalRequests++;
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                console.log(`💰 获取代币价格 (尝试 ${attempt}/${this.maxRetries})...`);
                console.log(`   代币: ${this._getTokenSymbol(mintAddress)}`);
                console.log(`   基准: ${this._getTokenSymbol(vsToken)}`);
                
                // Orca API 获取价格
                const response = await this.axiosInstance.get('/whirlpool/token_price', {
                    params: {
                        mint: mintAddress
                    }
                });
                
                const responseTime = Date.now() - startTime;
                this.metrics.successfulRequests++;
                this.metrics.lastSuccess = new Date().toISOString();
                this._updateAverageResponseTime(responseTime);
                
                const priceData = response.data;
                console.log(`✅ 价格获取成功 (${responseTime}ms)`);
                console.log(`   价格: $${priceData.price?.toFixed(4) || 'N/A'}`);
                console.log(`   24h交易量: $${this._formatNumber(priceData.volume_24h)}`);
                
                return {
                    mint: mintAddress,
                    symbol: this._getTokenSymbol(mintAddress),
                    price: priceData.price || 0,
                    priceUSD: priceData.price || 0,
                    volume24h: priceData.volume_24h || 0,
                    liquidity: priceData.liquidity || 0,
                    responseTime,
                    timestamp: new Date().toISOString()
                };
                
            } catch (error) {
                console.warn(`⚠️  请求失败，${attempt}/${this.maxRetries} 次重试...`);
                
                if (attempt === this.maxRetries) {
                    this.metrics.failedRequests++;
                    this.metrics.lastError = {
                        message: error.message,
                        timestamp: new Date().toISOString()
                    };
                    
                    // 如果Orca API失败，尝试使用CoinGecko作为备选
                    return await this._getPriceFromCoinGecko(mintAddress);
                }
                
                await this._sleep(this.retryDelay);
            }
        }
    }
    
    /**
     * 从 CoinGecko 获取价格（备选方案）
     */
    async _getPriceFromCoinGecko(mintAddress) {
        try {
            console.log('🔄 尝试从 CoinGecko 获取价格...');
            
            // 映射代币符号到 CoinGecko ID
            const tokenSymbol = this._getTokenSymbol(mintAddress);
            const cgId = this._getCoinGeckoId(tokenSymbol);
            
            if (!cgId) {
                throw new Error(`未找到 CoinGecko ID 映射: ${tokenSymbol}`);
            }
            
            const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
                params: {
                    ids: cgId,
                    vs_currencies: 'usd',
                    include_24hr_vol: true,
                    include_24hr_change: true
                },
                timeout: 5000
            });
            
            const priceData = response.data[cgId];
            if (!priceData) {
                throw new Error(`CoinGecko 未返回价格数据: ${cgId}`);
            }
            
            console.log(`✅ CoinGecko 价格获取成功: $${priceData.usd}`);
            
            return {
                mint: mintAddress,
                symbol: tokenSymbol,
                price: priceData.usd,
                priceUSD: priceData.usd,
                volume24h: priceData.usd_24h_vol || 0,
                change24h: priceData.usd_24h_change || 0,
                source: 'coingecko',
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error(`❌ CoinGecko 价格获取失败: ${error.message}`);
            throw new Error(`无法获取代币价格: ${error.message}`);
        }
    }
    
    /**
     * 获取代币列表
     */
    async getTokenList() {
        try {
            console.log('📋 获取 Orca 代币列表...');
            
            // Orca 可能没有直接的代币列表端点，我们使用已知代币
            const tokens = Object.entries(this.tokens).map(([symbol, address]) => ({
                symbol,
                address,
                decimals: this.tokenMetadata[address]?.decimals || 6,
                name: this.tokenMetadata[address]?.name || symbol
            }));
            
            console.log(`✅ 获取到 ${tokens.length} 个代币`);
            return tokens;
            
        } catch (error) {
            console.error('❌ 获取代币列表失败:', error.message);
            throw error;
        }
    }
    
    /**
     * 获取池子信息
     */
    async getPoolInfo(tokenA, tokenB) {
        try {
            console.log('🏊 获取池子信息...');
            console.log(`   ${this._getTokenSymbol(tokenA)} / ${this._getTokenSymbol(tokenB)}`);
            
            // 这里需要根据 Orca API 的实际端点调整
            // 目前返回模拟数据
            return {
                tokenA,
                tokenB,
                liquidity: 1000000, // 模拟数据
                volume24h: 500000,
                feeRate: 0.003, // 0.3%
                tickSpacing: 64,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('❌ 获取池子信息失败:', error.message);
            throw error;
        }
    }
    
    /**
     * 获取交易报价（模拟）
     */
    async getQuote(inputMint, outputMint, amount) {
        try {
            console.log('💰 获取交易报价...');
            console.log(`   ${this._getTokenSymbol(inputMint)} → ${this._getTokenSymbol(outputMint)}`);
            console.log(`   金额: ${this._formatAmount(amount, inputMint)}`);
            
            // 获取输入和输出代币价格
            const inputPrice = await this.getTokenPrice(inputMint);
            const outputPrice = await this.getTokenPrice(outputMint);
            
            if (!inputPrice.price || !outputPrice.price) {
                throw new Error('无法获取代币价格');
            }
            
            // 计算报价
            const inputValue = (amount / Math.pow(10, this._getDecimals(inputMint))) * inputPrice.price;
            const outputAmount = (inputValue / outputPrice.price) * Math.pow(10, this._getDecimals(outputMint));
            
            // 考虑滑点和费用（模拟）
            const slippage = 0.005; // 0.5%
            const fee = 0.003; // 0.3%
            const finalOutput = outputAmount * (1 - slippage - fee);
            
            console.log(`✅ 报价计算完成`);
            console.log(`   输入价值: $${inputValue.toFixed(2)}`);
            console.log(`   输出金额: ${this._formatAmount(finalOutput, outputMint)}`);
            console.log(`   预估滑点: ${(slippage * 100).toFixed(2)}%`);
            console.log(`   预估费用: ${(fee * 100).toFixed(2)}%`);
            
            return {
                inputMint,
                outputMint,
                inAmount: amount,
                outAmount: Math.floor(finalOutput),
                inValueUSD: inputValue,
                outValueUSD: inputValue * (1 - fee), // 扣除费用
                priceImpact: slippage * 100, // 价格影响百分比
                feeBps: fee * 10000, // 费用 basis points
                slippageBps: slippage * 10000, // 滑点 basis points
                route: ['orca'], // 路由信息
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('❌ 获取报价失败:', error.message);
            throw error;
        }
    }
    
    /**
     * 健康检查
     */
    async healthCheck() {
        try {
            console.log('🏥 Orca API 健康检查...');
            
            // 测试获取 SOL 价格
            const price = await this.getTokenPrice(this.tokens.SOL);
            
            return {
                healthy: true,
                responseTime: price.responseTime || 0,
                price: price.price,
                timestamp: new Date().toISOString(),
                message: 'Orca API 正常'
            };
            
        } catch (error) {
            return {
                healthy: false,
                error: error.message,
                timestamp: new Date().toISOString(),
                message: 'Orca API 异常'
            };
        }
    }
    
    /**
     * 获取指标统计
     */
    getMetrics() {
        return {
            ...this.metrics,
            successRate: this.metrics.totalRequests > 0 
                ? (this.metrics.successfulRequests / this.metrics.totalRequests * 100).toFixed(2) + '%'
                : '0%'
        };
    }
    
    /**
     * 辅助方法
     */
    _getTokenSymbol(mintAddress) {
        for (const [symbol, address] of Object.entries(this.tokens)) {
            if (address === mintAddress) return symbol;
        }
        return mintAddress.slice(0, 8) + '...';
    }
    
    _getDecimals(mintAddress) {
        return this.tokenMetadata[mintAddress]?.decimals || 6;
    }
    
    _formatAmount(amount, mintAddress) {
        const decimals = this._getDecimals(mintAddress);
        const symbol = this._getTokenSymbol(mintAddress);
        return `${(amount / Math.pow(10, decimals)).toFixed(4)} ${symbol}`;
    }
    
    _formatNumber(num) {
        if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
        if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
        if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
        return `$${num.toFixed(2)}`;
    }
    
    _getCoinGeckoId(symbol) {
        const mapping = {
            'SOL': 'solana',
            'USDC': 'usd-coin',
            'USDT': 'tether',
            'BONK': 'bonk',
            'WIF': 'dogwifhat',
            'ORCA': 'orca'
        };
        return mapping[symbol];
    }
    
    _updateAverageResponseTime(responseTime) {
        const total = this.metrics.successfulRequests;
        const oldAvg = this.metrics.averageResponseTime;
        this.metrics.averageResponseTime = ((oldAvg * (total - 1)) + responseTime) / total;
    }
    
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 导出
module.exports = OrcaClient;

// 测试代码
if (require.main === module) {
    (async () => {
        console.log('🧪 测试 OrcaClient...\n');
        
        const client = new OrcaClient();
        
        try {
            // 健康检查
            const health = await client.healthCheck();
            console.log(`🏥 健康检查: ${health.healthy ? '✅ 正常' : '❌ 异常'}`);
            console.log(`   SOL 价格: $${health.price}`);
            
            if (!health.healthy) {
                console.log(`   错误: ${health.error}`);
                process.exit(1);
            }
            
            // 测试获取多个代币价格
            console.log('\n💰 测试获取代币价格:');
            const tokens = ['SOL', 'USDC', 'BONK', 'WIF'];
            
            for (const tokenSymbol of tokens) {
                const mintAddress = client.tokens[tokenSymbol];
                if (mintAddress) {
                    try {
                        const price = await client.getTokenPrice(mintAddress);
                        console.log(`   ${tokenSymbol}: $${price.price?.toFixed(4) || 'N/A'} (${price.source || 'orca'})`);
                        await client._sleep(1000); // 避免速率限制
                    } catch (error) {
                        console.log(`   ${tokenSymbol}: 获取失败 - ${error.message}`);
                    }
                }
            }
            
            // 测试获取报价
            console.log('\n💱 测试获取报价:');
            const quote = await client.getQuote(
                client.tokens.SOL,
                client.tokens.USDC,
                0.1 * 1e9 // 0.1 SOL
            );
            
            console.log(`\n📋 报价详情:`);
            console.log(`   输入: ${client._formatAmount(quote.inAmount, client.tokens.SOL)}`);
            console.log(`   输出: ${client._formatAmount(quote.outAmount, client.tokens.USDC)}`);
            console.log(`   输入价值: $${quote.inValueUSD.toFixed(2)}`);
            console.log(`   输出价值: $${quote.outValueUSD.toFixed(2)}`);
            console.log(`   价格影响: ${quote.priceImpact.toFixed(2)}%`);
            console.log(`   费用: ${(quote.feeBps / 100).toFixed(2)}%`);
            
            // 测试获取代币列表
            console.log('\n📋 测试获取代币列表:');
            const tokenList = await client.getTokenList();
            console.log(`   代币数量: ${tokenList.length}`);
            console.log('   前5个代币:');
            tokenList.slice(0, 5).forEach(token => {
                console.log(`     ${token.symbol}: ${token.address.slice(0, 8)}...`);
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