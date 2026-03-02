const axios = require('axios');
const logger = require('../utils/logger');
const { callWithRetry } = require('../utils/api-error-handler');

class PriceFetcher {
    constructor() {
        this.baseURL = 'https://api.dexscreener.com';
        this.cache = new Map();
        this.cacheTTL = 10000; // 10秒缓存
    }

    /**
     * 获取Solana热门Meme币列表
     * 使用正确的DEXScreener API端点，带错误处理和重试
     */
    async getSolanaMemeTokens() {
        try {
            const apiCall = async () => {
                const response = await axios.get(`${this.baseURL}/latest/dex/search`, {
                    params: {
                        q: 'solana',
                        rankBy: 'volume',
                        limit: 50,
                        timeout: 10000  // 10秒超时
                    }
                });
                
                if (!response.data || !response.data.pairs) {
                    throw new Error('API返回格式异常');
                }
                
                return response;
            };
            
            // 使用带重试的API调用
            const response = await callWithRetry(
                apiCall,
                'getSolanaMemeTokens',
                { rateLimit: 30 }  // 每分钟30次限制
            );
            
            // 过滤和格式化代币数据
            const solanaTokens = response.data.pairs
                .filter(pair => 
                    pair.chainId === 'solana' && 
                    this.isMemeToken(pair)
                )
                .map(pair => ({
                    symbol: pair.baseToken.symbol,
                    name: pair.baseToken.name,
                    address: pair.baseToken.address,
                    priceUSD: parseFloat(pair.priceUsd),
                    priceNative: parseFloat(pair.priceNative),
                    volume24h: parseFloat(pair.volume?.h24 || 0),
                    liquidity: parseFloat(pair.liquidity?.usd || 0),
                    dexId: pair.dexId,
                    pairAddress: pair.pairAddress,
                    chainId: pair.chainId,
                    timestamp: Date.now()
                }));
            
            logger.info(`获取到 ${solanaTokens.length} 个Solana Meme币`);
            return solanaTokens;
            
        } catch (error) {
            logger.error('获取代币列表失败，所有重试尝试都失败了:', error.message);
            return [];
        }
    }

    /**
     * 获取代币详细价格信息
     * 使用正确的API端点，带错误处理和重试
     */
    async getTokenPrice(tokenSymbol) {
        const cacheKey = `price_${tokenSymbol}`;
        const cached = this.cache.get(cacheKey);
        
        // 检查缓存
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            logger.debug(`从缓存获取 ${tokenSymbol} 价格`);
            return cached.data;
        }

        try {
            const apiCall = async () => {
                const response = await axios.get(`${this.baseURL}/latest/dex/search`, {
                    params: {
                        q: tokenSymbol,
                        chainIds: 'solana',
                        timeout: 8000  // 8秒超时
                    }
                });
                
                if (!response.data || !response.data.pairs || response.data.pairs.length === 0) {
                    throw new Error(`未找到代币 ${tokenSymbol} 的价格数据`);
                }
                
                return response;
            };
            
            // 使用带重试的API调用
            const response = await callWithRetry(
                apiCall,
                `getTokenPrice_${tokenSymbol}`,
                { rateLimit: 60 }  // 每分钟60次限制
            );
            
            // 获取交易量最大的交易对
            const pair = response.data.pairs.reduce((max, current) => 
                (current.volume?.h24 || 0) > (max.volume?.h24 || 0) ? current : max
            );
            
            const priceData = {
                symbol: tokenSymbol,
                priceUSD: parseFloat(pair.priceUsd || 0),
                priceNative: parseFloat(pair.priceNative || 0),
                volume24h: parseFloat(pair.volume?.h24 || 0),
                liquidity: parseFloat(pair.liquidity?.usd || 0),
                priceChange24h: parseFloat(pair.priceChange?.h24 || 0),
                priceChange5m: parseFloat(pair.priceChange?.m5 || 0),
                priceChange1h: parseFloat(pair.priceChange?.h1 || 0),
                createdAt: pair.pairCreatedAt || Date.now(),
                dexId: pair.dexId || 'unknown',
                baseToken: pair.baseToken || { symbol: tokenSymbol },
                quoteToken: pair.quoteToken || { symbol: 'USDC' },
                pairAddress: pair.pairAddress,
                chainId: pair.chainId || 'solana',
                timestamp: Date.now(),
                fetchedAt: new Date().toISOString(),
                source: 'dexscreener'
            };
            
            // 更新缓存
            this.cache.set(cacheKey, {
                timestamp: Date.now(),
                data: priceData
            });
            
            logger.debug(`获取到 ${tokenSymbol} 价格: $${priceData.priceUSD}`);
            return priceData;
            
        } catch (error) {
            logger.error(`获取代币 ${tokenSymbol} 价格失败，所有重试尝试都失败了:`, error.message);
            
            // 如果缓存中有旧数据，返回旧数据（带过期标记）
            if (cached) {
                logger.warn(`返回缓存的 ${tokenSymbol} 价格数据（可能已过期）`);
                return {
                    ...cached.data,
                    isCached: true,
                    cacheAge: Date.now() - cached.timestamp
                };
            }
            
            return null;
        }
    }

    /**
     * 获取代币价格历史（简化版）
     */
    async getPriceHistory(tokenAddress, timeframe = '5m') {
        try {
            // 注意：DEXScreener API 可能不直接提供历史数据
            // 这里使用模拟数据，实际需要接入其他数据源
            const currentPrice = await this.getTokenPrice(tokenAddress);
            
            if (!currentPrice) return [];
            
            // 生成模拟历史数据
            return this.generateMockHistory(currentPrice.priceUSD, timeframe);
        } catch (error) {
            logger.error(`获取价格历史失败:`, error.message);
            return [];
        }
    }

    /**
     * 判断是否为Meme币或热门Solana代币
     */
    isMemeToken(pair) {
        const baseToken = pair.baseToken || {};
        const name = (baseToken.name || '').toLowerCase();
        const symbol = (baseToken.symbol || '').toLowerCase();
        const liquidity = parseFloat(pair.liquidity?.usd || 0);
        
        // Meme币常见特征
        const memeKeywords = [
            'bonk', 'wif', 'popcat', 'wen', 'myro', 'dog', 'cat', 'pepe',
            'woof', 'meow', 'floki', 'shib', 'doge', 'sats', 'rats', 'frog',
            'bome', 'silly', 'pnut', 'goat', 'act', 'mood', 'cope', 'degen',
            'slerf', 'list', 'frens', 'chi', 'hege', 'benny', 'micto', '犇'
        ];
        
        // 检查是否是Meme币
        const isMeme = memeKeywords.some(keyword => 
            name.includes(keyword) || symbol.includes(keyword)
        );
        
        // 有流动性的SOL交易对
        const hasLiquidity = liquidity > 10000;
        
        // 返回Meme币或有足够流动性的代币
        return isMeme || hasLiquidity;
    }

    /**
     * 生成模拟历史数据（用于开发测试）
     */
    generateMockHistory(currentPrice, timeframe) {
        const prices = [];
        const now = Date.now();
        const interval = timeframe === '5m' ? 300000 : 60000; // 5分钟或1分钟
        
        // 生成过去30个时间点的价格
        for (let i = 30; i >= 0; i--) {
            const timestamp = now - (i * interval);
            // 添加随机波动
            const volatility = 0.02; // 2%波动
            const randomChange = (Math.random() - 0.5) * 2 * volatility;
            const price = currentPrice * (1 + randomChange);
            
            prices.push({
                timestamp,
                price,
                volume: Math.random() * 1000000 // 模拟交易量
            });
        }
        
        return prices;
    }

    /**
     * 批量获取多个代币价格
     */
    async batchGetPrices(tokenAddresses) {
        const promises = tokenAddresses.map(addr => 
            this.getTokenPrice(addr).catch(() => null)
        );
        
        const results = await Promise.all(promises);
        return results.filter(Boolean);
    }
}

module.exports = PriceFetcher;