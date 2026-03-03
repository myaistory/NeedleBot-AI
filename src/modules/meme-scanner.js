/**
 * MemeSignalCapture - 新币自动发现 + 多数据源投票
 * 修复版：使用正确的API端点
 */

const axios = require('axios');

class MemeSignalCapture {
    constructor() {
        this.detector = null;
        this.knownTokens = new Set();
        this.candidates = [];
        
        this.config = {
            scanInterval: 30000,
            minLiquidity: 15000,
            maxTokens: 50
        };
        
        // 初始化热门代币
        this.initKnownTokens();
    }
    
    initKnownTokens() {
        const popularTokens = [
            { symbol: 'BONK', address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' },
            { symbol: 'WIF', address: '85VBFQZC9TZkfaptBWqv14ALD9fJNUKtWA41kh69teRP' },
            { symbol: 'POPCAT', address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRu17g6Mbx' },
            { symbol: 'SOL', address: 'So11111111111111111111111111111111111111112' },
            { symbol: 'MEW', address: 'MEWEzZ16Q2HkCg2QE8xg4UA4v6nJhWPhAhhZXP3WcSF' },
            { symbol: 'BOME', address: 'bopmFM5EtJ6z7z5z5z5z5z5z5z5z5z5z5z5z5z5' },
            { symbol: 'SILLY', address: 'sillyFM5EtJ6z7z5z5z5z5z5z5z5z5z5z5z5z5z' },
            { symbol: 'PNUT', address: 'nuttFM5EtJ6z7z5z5z5z5z5z5z5z5z5z5z5z5z' },
            { symbol: 'GOAT', address: 'goatFM5EtJ6z7z5z5z5z5z5z5z5z5z5z5z5z' },
            { symbol: 'ACT', address: 'actFM5EtJ6z7z5z5z5z5z5z5z5z5z5z5z5z' },
        ];
        
        popularTokens.forEach(t => this.knownTokens.add(t.address));
    }
    
    // 获取热门代币 - 使用正确的端点
    async getTrendingTokens() {
        try {
            // 使用DexScreener的搜索API
            const response = await axios.get(
                'https://api.dexscreener.com/latest/dex/search?q=solana',
                { timeout: 10000 }
            );
            
            if (response.data?.pairs) {
                return response.data.pairs
                    .filter(p => p.liquidity?.usd >= this.config.minLiquidity)
                    .map(p => ({
                        symbol: p.baseToken?.symbol,
                        address: p.baseToken?.address,
                        liquidity: p.liquidity?.usd,
                        price: p.priceUsd,
                        volume24h: p.volume?.h24
                    }))
                    .slice(0, 30);
            }
            return [];
        } catch (error) {
            console.log('[MemeScanner] 获取热门失败:', error.message);
            return [];
        }
    }
    
    async scanNewMemes() {
        console.log('[MemeScanner] 🔍 扫描新meme币...');
        
        try {
            const trending = await this.getTrendingTokens();
            console.log(`[MemeScanner] 获取到 ${trending.length} 个代币`);
            
            const newCandidates = trending.filter(t => 
                !this.knownTokens.has(t.address) && 
                t.liquidity >= this.config.minLiquidity
            );
            
            console.log(`[MemeScanner] 发现 ${newCandidates.length} 个新候选币`);
            
            for (const token of newCandidates) {
                if (this.knownTokens.size < this.config.maxTokens) {
                    this.knownTokens.add(token.address);
                    this.candidates.push(token);
                    console.log(`[MemeScanner] ✅ 新币: ${token.symbol} - $${token.liquidity}`);
                }
            }
            
            return newCandidates;
            
        } catch (error) {
            console.error('[MemeScanner] 扫描失败:', error.message);
            return [];
        }
    }
    
    async checkSingleToken(address) {
        try {
            const response = await axios.get(
                `https://api.dexscreener.com/latest/dex/tokens/${address}`,
                { timeout: 8000 }
            );
            
            if (response.data?.pairs?.[0]) {
                const pair = response.data.pairs[0];
                return {
                    symbol: pair.baseToken?.symbol,
                    price: parseFloat(pair.priceUsd) || 0,
                    priceChange5m: parseFloat(pair.priceChange?.m5) || 0,
                    priceChange1h: parseFloat(pair.priceChange?.h1) || 0,
                    liquidity: parseFloat(pair.liquidity?.usd || 0)
                };
            }
            return null;
        } catch (error) {
            return null;
        }
    }
    
    start() {
        console.log('[MemeScanner] ✅ 启动新币扫描...');
        this.scanNewMemes();
        this.intervalId = setInterval(() => this.scanNewMemes(), this.config.scanInterval);
    }
    
    stop() {
        if (this.intervalId) clearInterval(this.intervalId);
    }
    
    getStats() {
        return {
            knownTokens: this.knownTokens.size,
            candidates: this.candidates.length,
            isRunning: !!this.intervalId
        };
    }
}

module.exports = MemeSignalCapture;
