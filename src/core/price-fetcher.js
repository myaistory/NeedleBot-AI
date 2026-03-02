const axios = require('axios');
const logger = require('../utils/logger');

class PriceFetcher {
    constructor() {
        this.baseURL = 'https://api.dexscreener.com';
        this.cache = new Map();
        this.cacheTTL = 30000; // 30秒缓存
        
        // Known token symbols to search
        this.knownTokens = ['BONK', 'WIF', 'POPCAT', 'BOME', 'WEN', 'MYRO', 'JUP', 'SOL'];
    }

    async searchToken(symbol) {
        const cacheKey = `search_${symbol}`;
        const cached = this.cache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp < this.cacheTTL)) {
            logger.debug(`从缓存获取 ${symbol}`);
            return cached.data;
        }

        try {
            const response = await axios.get(`${this.baseURL}/latest/dex/search`, {
                params: { q: symbol, chain: 'solana' },
                timeout: 10000
            });

            if (!response.data?.pairs || response.data.pairs.length === 0) {
                return null;
            }

            // Find the best pair (usually first one)
            const pair = response.data.pairs[0];
            const priceData = {
                symbol: pair.baseToken?.symbol || symbol,
                name: pair.baseToken?.name || symbol,
                address: pair.baseToken?.address,
                price: parseFloat(pair.priceUsd),
                priceNative: parseFloat(pair.priceNative),
                volume: parseFloat(pair.volume?.h24 || 0),
                liquidity: parseFloat(pair.liquidity?.usd || 0),
                change24h: parseFloat(pair.priceChange?.h24 || 0),
                dexId: pair.dexId,
                pairAddress: pair.pairAddress,
            };

            this.cache.set(cacheKey, { data: priceData, timestamp: Date.now() });
            logger.debug(`获取到 ${symbol}: $${priceData.price}`);
            return priceData;

        } catch (error) {
            logger.error(`搜索 ${symbol} 失败: ${error.message}`);
            return null;
        }
    }

    async getSolanaMemeTokens() {
        const results = [];
        
        for (const symbol of this.knownTokens) {
            try {
                const data = await this.searchToken(symbol);
                if (data) {
                    results.push({
                        symbol: data.symbol,
                        name: data.name,
                        address: data.address,
                        priceUSD: data.price,
                        priceNative: data.priceNative,
                        volume24h: data.volume,
                        liquidity: data.liquidity,
                        change24h: data.change24h,
                        dexId: data.dexId,
                        pairAddress: data.pairAddress,
                        chainId: 'solana',
                        timestamp: Date.now()
                    });
                }
            } catch (e) {
                // skip
            }
        }
        
        logger.info(`获取到 ${results.length} 个代币`);
        return results;
    }

    async getTokenPrice(address) {
        // Legacy function - not used
        return null;
    }

    async getPriceHistory(address, timeframe = '5m') {
        return [];
    }

    async batchGetPrices(addresses) {
        return [];
    }
}

module.exports = PriceFetcher;
