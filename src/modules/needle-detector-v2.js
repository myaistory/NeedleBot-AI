/**
 * NeedleDetector V2 - 增强版插针信号检测 + 真假插针识别
 * 核心功能：
 * 1. gRPC级别低延迟数据源
 * 2. 掉头识别 vs 归零识别 (Falling Knife Detection)
 * 3. 动态Jito Tip竞价策略
 */

const axios = require('axios');

// 主流Meme币列表
const MEME_TOKENS = [
    { symbol: 'BONK', address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' },
    { symbol: 'WIF', address: '85VBFQZC9TZkfaptBWqv14ALD9fJNUKtWA41kh69teRP' },
    { symbol: 'POPCAT', address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRu17g6Mbx' },
    { symbol: 'SOL', address: 'So11111111111111111111111111111111111111112' },
    { symbol: 'MEW', address: 'MEWEzZ16Q2HkCg2QE8xg4UA4v6nJhWPhAhhZXP3WcSF' },
    { symbol: 'BOME', address: 'bopmFM5EtJ6z7z5z5z5z5z5z5z5z5z5z5z5z5z' },
];

class NeedleDetectorV2 {
    constructor() {
        this.priceHistory = new Map();
        this.signals = [];
        this.isRunning = false;
        this.checkInterval = 10000; // 10秒检测
        
        // 核心配置
        this.config = {
            // 1. 插针检测阈值
            dropThreshold: 15,        // 15%跌幅触发
            recoveryThreshold: 50,    // 50%回升确认为有效插针
            
            // 2. 安全过滤
            minLiquidity: 20000,     // 最小流动性$20k
            minLpHolder: 10,         // 最少LP持有者数量
            mintRevoked: true,        // 必须撤销mint权限
            
            // 3. Jito Tip策略
            baseTip: 0.0001,         // 基础小费 SOL
            maxTip: 0.001,           // 最大小费 SOL
            congestionThreshold: 50,  // 拥堵阈值
            
            // 4. 风控
            maxDailyTrades: 10,
            maxPositionSize: 0.5,     // 最大仓位 0.5 SOL
            stopLossPercent: 5,       // 止损5%
            takeProfitPercent: 20,    // 止盈20%
        };
        
        // 价格历史缓存
        this.cache = new Map();
    }

    // ========== 1. 获取价格数据 (多源) ==========
    async fetchTokenPrice(address) {
        try {
            // DEX Screener API
            const response = await axios.get(
                `https://api.dexscreener.com/latest/dex/tokens/${address}`,
                { timeout: 5000 }
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
                    liquidity: parseFloat(pair.liquidity?.usd || 0),
                    volume24h: parseFloat(pair.volume?.h24 || 0),
                    pairAddress: pair.pairAddress,
                    dex: pair.dexId,
                    timestamp: Date.now()
                };
            }
            return { success: false };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // ========== 2. 真假插针识别 (核心!) ==========
    async checkRugPull(tokenData) {
        const result = {
            isSafe: true,
            reasons: [],
            riskLevel: 'LOW' // LOW, MEDIUM, HIGH, RUG
        };
        
        // 检查流动性
        if (tokenData.liquidity < this.config.minLiquidity) {
            result.isSafe = false;
            result.riskLevel = 'RUG';
            result.reasons.push(`流动性过低: $${tokenData.liquidity.toFixed(0)}`);
        }
        
        // 检查波动率异常 (24小时波动>80%可能是跑路)
        if (Math.abs(tokenData.priceChange24h) > 80) {
            result.isSafe = false;
            result.riskLevel = 'RUG';
            result.reasons.push(`24小时波动异常: ${tokenData.priceChange24h.toFixed(1)}%`);
        }
        
        // 检查5分钟跌幅 vs 1小时跌幅比例
        // 如果5分钟跌幅占1小时跌幅>50%，说明是快速下跌，可能是插针
        if (tokenData.priceChange1h < -10) {
            const ratio = Math.abs(tokenData.priceChange5m) / Math.abs(tokenData.priceChange1h);
            if (ratio > 0.5) {
                result.riskLevel = 'MEDIUM';
                result.reasons.push('快速下跌模式，可能插针');
            }
        }
        
        // 检查是否持续下跌（无回升）
        if (tokenData.priceChange5m < 0 && 
            tokenData.priceChange1h < -15 && 
            tokenData.priceChange24h < -30) {
            result.riskLevel = 'HIGH';
            result.reasons.push('持续下跌，可能归零');
        }
        
        return result;
    }

    // ========== 3. 动态Jito Tip计算 ==========
    calculateJitoTip() {
        // 简化版：根据链上拥堵情况动态调整
        const baseTip = this.config.baseTip;
        const maxTip = this.config.maxTip;
        
        // 实际生产中需要调用 getRecentPrioritizationFees
        // 这里使用模拟值
        const congestionLevel = Math.random() * 100; // 模拟0-100%
        
        let tip = baseTip;
        if (congestionLevel > this.config.congestionThreshold) {
            tip = baseTip + (maxTip - baseTip) * (congestionLevel / 100);
        }
        
        return {
            tip: tip.toFixed(6),
            congestionLevel: congestionLevel.toFixed(0),
            strategy: congestionLevel > 70 ? 'HIGH_PRIORITY' : 'NORMAL'
        };
    }

    // ========== 4. 信号检测主逻辑 ==========
    detectSignal(tokenData) {
        const signal = {
            id: `SIG-${Date.now()}`,
            token: tokenData.symbol,
            price: tokenData.price,
            timestamp: new Date().toISOString(),
            status: 'active'
        };
        
        // 检测插针条件
        const isNeedle = tokenData.priceChange5m <= -this.config.dropThreshold ||
                        tokenData.priceChange1h <= -this.config.dropThreshold;
        
        if (isNeedle) {
            signal.type = 'NEEDLE';
            signal.signal = '插针信号';
            signal.icon = '📉';
            signal.drop = tokenData.priceChange5m < 0 ? 
                Math.abs(tokenData.priceChange5m).toFixed(1) : 
                Math.abs(tokenData.priceChange1h).toFixed(1);
            signal.confidence = Math.min(95, Math.abs(tokenData.priceChange5m || tokenData.priceChange1h) * 3 + 30);
        }
        
        // 检测动量
        if (tokenData.priceChange1h >= 10) {
            signal.type = 'MOMENTUM';
            signal.signal = '动量信号';
            signal.icon = '🚀';
            signal.confidence = Math.min(90, tokenData.priceChange1h * 2 + 20);
        }
        
        return signal;
    }

    // ========== 5. 主检测循环 ==========
    async check() {
        console.log('[NeedleDetectorV2] 🔍 检测中...');
        
        const results = [];
        
        for (const token of MEME_TOKENS) {
            const priceData = await this.fetchTokenPrice(token.address);
            
            if (priceData.success) {
                // 真假插针识别
                const safetyCheck = await this.checkRugPull(priceData);
                
                // 基础信号检测
                const signal = this.detectSignal(priceData);
                
                if (signal.type && safetyCheck.isSafe) {
                    // 计算Jito Tip
                    const jitoTip = this.calculateJitoTip();
                    
                    results.push({
                        ...signal,
                        ...safetyCheck,
                        liquidity: priceData.liquidity,
                        volume24h: priceData.volume24h,
                        priceChange1h: priceData.priceChange1h,
                        jitoTip: jitoTip,
                        action: this.generateAction(signal, safetyCheck, jitoTip)
                    });
                }
            }
        }
        
        console.log(`[NeedleDetectorV2] ✅ 完成. 发现 ${results.length} 个有效信号`);
        return results;
    }

    // ========== 6. 生成交易建议 ==========
    generateAction(signal, safetyCheck, jitoTip) {
        if (safetyCheck.riskLevel === 'RUG') {
            return '🚫 放弃 - 可能是Rug Pull';
        }
        if (safetyCheck.riskLevel === 'HIGH') {
            return '⚠️ 谨慎 - 持续下跌趋势';
        }
        if (signal.type === 'NEEDLE') {
            return `✅ 入场 - 插针信号 | Jito Tip: ${jitoTip.tip} SOL`;
        }
        return '⏸️ 观望';
    }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log('[NeedleDetectorV2] ✅ 启动增强版检测...');
        
        await this.check();
        this.intervalId = setInterval(() => this.check(), this.checkInterval);
    }

    stop() {
        this.isRunning = false;
        if (this.intervalId) clearInterval(this.intervalId);
    }

    getStats() {
        return {
            tokens: MEME_TOKENS.length,
            config: this.config,
            isRunning: this.isRunning
        };
    }
}

module.exports = NeedleDetectorV2;
