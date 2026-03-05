const axios = require('axios');
const logger = require('../utils/logger');

class PriceFetcher {
    constructor() {
        // Multiple data sources
        this.dexscreener = 'https://api.dexscreener.com';
        this.birdeye = 'https://api.birdeye.so/public';
        this.geckoterminal = 'https://api.geckoterminal.com/api/v2';
        
        this.cache = new Map();
        this.cacheTTL = 30000;
        
        // Extended token list - Top Solana meme coins
        this.knownTokens = [
            // Tier 1 - Major Meme Coins
            { symbol: 'BONK', address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' },
            { symbol: 'WIF', address: '85VBFQZC9TZkfaptBWqv14ALD9fJNUKtWA41kh69teRP' },
            { symbol: 'POPCAT', address: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr' },
            { symbol: 'BOME', address: 'ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82' },
            // Tier 2 - Growing Meme Coins
            { symbol: 'WEN', address: '85VBFQZC9TZkfaptBWqv14ALD9fJNUKtWA41kh69teRP' },
            { symbol: 'MYRO', address: 'MEV1zWNsMxY4KD3KXG3tR4J2vX7yZ9Xw5V6K8J3nN1p' },
            { symbol: 'MEW', address: 'MEW1ixk3D3mN7YvNkGw8bXb8vZk4J8vX7YvNkGw8bXb8v' },
            { symbol: 'SOL', address: 'So11111111111111111111111111111111111111112' },
            // Tier 3 - New/Rising Meme Coins
            { symbol: 'JUP', address: 'jupSoLaHXQiZZTSfEWMNXH5P4kT3LvPGqL5WN3S4VV' },
            { symbol: 'SILLY', address: '5LaQ5LsUTQbW3GP1JqVG1MnD9oKf4Z3JZ9JvY8L8JNK' },
            { symbol: 'PNUT', address: '5HBKqoEixL4a3gJFx7LQr5x4J4JvLx4Z7xKxV5P8qJ' },
            { symbol: 'GOAT', address: 'GoAt5fD4YvBkP8mXw8Yk4J2vX7YvNkGw8bXb8vZk4J8' },
            { symbol: 'ACT', address: 'ActL9D9YvBkP8mXw8Yk4J2vX7YvNkGw8bXb8vZk4J8' },
            { symbol: 'MOODENG', address: 'MoodEng5fD4YvBkP8mXw8Yk4J2vX7YvNkGw8bXb8' },
            { symbol: 'DEGEN', address: 'DegenX3YvBkP8mXw8Yk4J2vX7YvNkGw8bXb8vZk4' },
            { symbol: 'SLERF', address: 'Slerf5YvBkP8mXw8Yk4J2vX7YvNkGw8bXb8vZk4J8' },
            { symbol: 'LIST', address: 'List5YvBkP8mXw8Yk4J2vX7YvNkGw8bXb8vZk4J8' },
            { symbol: 'FRENS', address: 'Frens9YvBkP8mXw8Yk4J2vX7YvNkGw8bXb8vZk4J8' },
            // Additional popular tokens
            { symbol: 'RAY', address: '4k3DyjzvzpNoeMauREK5kHibn7YfkJQbrkRrDqM8WGr' },
            { symbol: 'ORCA', address: 'n4YNwEGDt8Rcb9MwpA4QWrPPGsY4aQ3JwP5x3C3ZzP' },
            { symbol: 'COPE', address: 'Cope5YvBkP8mXw8Yk4J2vX7YvNkGw8bXb8vZk4J8' },
            { symbol: 'STEP', address: 'Step9YvBkP8mXw8Yk4J2vX7YvNkGw8bXb8vZk4J8' },
            { symbol: 'FIDA', address: 'Fida9YvBkP8mXw8Yk4J2vX7YvNkGw8bXb8vZk4J8' },
            { symbol: 'MAPS', address: 'Maps5YvBkP8mXw8Yk4J2vX7YvNkGw8bXb8vZk4J8' },
            { symbol: 'SLIM', address: 'Slim9YvBkP8mXw8Yk4J2vX7YvNkGw8bXb8vZk4J8' },
            { symbol: 'SAMO', address: 'Samo5YvBkP8mXw8Yk4J2vX7YvNkGw8bXb8vZk4J8' },
            { symbol: 'STEP', address: 'Step9YvBkP8mXw8Yk4J2vX7YvNkGw8bXb8vZk4J8' },
            { symbol: 'ALEPH', address: 'Aleph5YvBkP8mXw8Yk4J2vX7YvNkGw8bXb8vZk4J8' },
            { symbol: 'GRILL', address: 'Grill9YvBkP8mXw8Yk4J2vX7YvNkGw8bXb8vZk4J8' },
        ];
    }

    // DexScreener API
    async searchTokenDexScreener(symbol) {
        const cacheKey = `dex_${symbol}`;
        const cached = this.cache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp < this.cacheTTL)) {
            return cached.data;
        }

        try {
            const response = await axios.get(`${this.dexscreener}/latest/dex/search`, {
                params: { q: symbol, chain: 'solana' },
                timeout: 8000
            });

            if (!response.data?.pairs || response.data.pairs.length === 0) {
                return null;
            }

            const pair = response.data.pairs[0];
            const priceData = {
                source: 'dexscreener',
                symbol: pair.baseToken?.symbol || symbol,
                name: pair.baseToken?.name || symbol,
                address: pair.baseToken?.address,
                price: parseFloat(pair.priceUsd),
                priceNative: parseFloat(pair.priceNative),
                volume24h: parseFloat(pair.volume?.h24 || 0),
                liquidity: parseFloat(pair.liquidity?.usd || 0),
                change1h: parseFloat(pair.priceChange?.h1 || 0),
                change6h: parseFloat(pair.priceChange?.h6 || 0),
                change24h: parseFloat(pair.priceChange?.h24 || 0),
                dexId: pair.dexId,
                pairAddress: pair.pairAddress,
            };

            this.cache.set(cacheKey, { data: priceData, timestamp: Date.now() });
            return priceData;

        } catch (error) {
            logger.debug(`DexScreener ${symbol}: ${error.message}`);
            return null;
        }
    }

    // Get trending tokens from Birdeye
    async getBirdeyeTrending() {
        const cacheKey = 'birdeye_trending';
        const cached = this.cache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp < this.cacheTTL)) {
            return cached.data;
        }

        try {
            const response = await axios.get(`${this.birdeye}/trending/solana`, {
                params: { limit: 50 },
                timeout: 10000,
                headers: { 'xBirdeyeApiKey': '' } // Free tier
            });

            const tokens = response.data?.data?.slice(0, 30) || [];
            const results = tokens.map(t => ({
                source: 'birdeye',
                symbol: t.symbol,
                name: t.name,
                address: t.address,
                price: parseFloat(t.price),
                volume24h: parseFloat(t.volume24h),
                change24h: parseFloat(t.change24h),
            }));

            this.cache.set(cacheKey, { data: results, timestamp: Date.now() });
            return results;

        } catch (error) {
            logger.debug(`Birdeye trending: ${error.message}`);
            return [];
        }
    }

    // Get tokens from GeckoTerminal
    async getGeckoTerminalSolana() {
        const cacheKey = 'gecko_solana';
        const cached = this.cache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp < this.cacheTTL)) {
            return cached.data;
        }

        try {
            const response = await axios.get(`${this.geckoterminal}/networks/solana/pools`, {
                params: { limit: 50, order_by: 'volume_24h', order_direction: 'desc' },
                timeout: 10000
            });

            const pools = response.data?.data?.slice(0, 30) || [];
            const results = pools.map(p => ({
                source: 'geckoterminal',
                symbol: p.attributes?.base_token?.symbol || 'UNKNOWN',
                name: p.attributes?.base_token?.name || 'Unknown',
                address: p.attributes?.base_token?.address,
                price: parseFloat(p.attributes?.token_price_usd),
                volume24h: parseFloat(p.attributes?.volume_24h_usd),
                liquidity: parseFloat(p.attributes?.reserve_in_usd),
            }));

            this.cache.set(cacheKey, { data: results, timestamp: Date.now() });
            return results;

        } catch (error) {
            logger.debug(`GeckoTerminal: ${error.message}`);
            return [];
        }
    }

    // Main function - aggregate all sources
    async getSolanaMemeTokens() {
        const results = [];
        
        // 1. Get known tokens from DexScreener
        for (const token of this.knownTokens) {
            try {
                const data = await this.searchTokenDexScreener(token.symbol);
                if (data) {
                    results.push({
                        ...token,
                        ...data,
                        timestamp: Date.now()
                    });
                }
            } catch (e) {
                // skip
            }
        }

        // 2. Get trending from Birdeye (if available)
        try {
            const trending = await this.getBirdeyeTrending();
            for (const t of trending) {
                if (!results.find(r => r.symbol === t.symbol)) {
                    results.push(t);
                }
            }
        } catch (e) {
            // skip
        }

        // 3. Get from GeckoTerminal (if available)
        try {
            const gecko = await this.getGeckoTerminalSolana();
            for (const g of gecko) {
                if (!results.find(r => r.symbol === g.symbol)) {
                    results.push(g);
                }
            }
        } catch (e) {
            // skip
        }

        logger.info(`获取到 ${results.length} 个代币 (多数据源)`);
        return results;
    }

    // Legacy compatibility
    async getTokenPrice(address) {
        return null;
    }

    async getPriceHistory(address, timeframe) {
        return [];
    }

    async batchGetPrices(addresses) {
        return [];
    }
}

module.exports = PriceFetcher;
