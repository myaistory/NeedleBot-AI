const logger = require('../utils/logger');

class MEVProtection {
    constructor(config = {}) {
        this.config = {
            baseSlippage: config.baseSlippage || 0.02,      // 基础滑点 2%
            maxSlippage: config.maxSlippage || 0.10,        // 最大滑点 10%
            volatilityMultiplier: config.volatilityMultiplier || 1.5,
            volumeMultiplier: config.volumeMultiplier || 1.2,
            timeMultiplier: config.timeMultiplier || 1.1,
            ...config
        };
        
        this.historicalData = new Map();
    }
    
    /**
     * 计算动态滑点
     */
    async calculateDynamicSlippage(tokenData, marketConditions = {}) {
        try {
            // 基础滑点
            let slippage = this.config.baseSlippage;
            
            // 基于波动率调整
            const volatility = this.calculateVolatility(tokenData);
            slippage *= (1 + volatility * this.config.volatilityMultiplier);
            
            // 基于成交量调整
            if (tokenData.volume24h && tokenData.marketCap) {
                const volumeRatio = tokenData.volume24h / tokenData.marketCap;
                if (volumeRatio > 0.5) {
                    slippage *= this.config.volumeMultiplier;
                }
            }
            
            // 基于网络拥堵调整
            const congestion = await this.getNetworkCongestion();
            slippage *= (1 + congestion * this.config.timeMultiplier);
            
            // 基于时间调整（避开 MEV 活跃时段）
            const timeFactor = this.getTimeFactor();
            slippage *= timeFactor;
            
            // 最大滑点限制
            slippage = Math.min(slippage, this.config.maxSlippage);
            
            // 记录历史数据
            this.recordSlippageCalculation({
                token: tokenData.symbol || 'unknown',
                calculatedSlippage: slippage,
                factors: { volatility, congestion, timeFactor },
                timestamp: Date.now()
            });
            
            logger.debug(`动态滑点计算: ${tokenData.symbol || 'unknown'} = ${(slippage * 100).toFixed(2)}%`);
            
            return slippage;
            
        } catch (error) {
            logger.error('动态滑点计算失败:', error);
            return this.config.baseSlippage; // 失败时返回基础滑点
        }
    }
    
    /**
     * 计算波动率
     */
    calculateVolatility(tokenData) {
        // 简化实现：基于价格变化估算波动率
        if (!tokenData.priceHistory || tokenData.priceHistory.length < 10) {
            return 0.3; // 默认中等波动率
        }
        
        const prices = tokenData.priceHistory.map(p => p.price);
        const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
        const variance = prices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / prices.length;
        const stdDev = Math.sqrt(variance);
        
        return stdDev / mean; // 相对波动率
    }
    
    /**
     * 获取网络拥堵级别
     */
    async getNetworkCongestion() {
        try {
            // 这里可以集成实际的网络监控
            // 暂时返回模拟值
            const now = new Date();
            const hour = now.getUTCHours();
            
            // 模拟拥堵模式：UTC 9-17点较高拥堵
            if (hour >= 9 && hour <= 17) {
                return 0.3 + Math.random() * 0.3;
            } else {
                return 0.1 + Math.random() * 0.2;
            }
            
        } catch (error) {
            logger.warn('获取网络拥堵失败，使用默认值:', error.message);
            return 0.2;
        }
    }
    
    /**
     * 获取时间因子（避开 MEV 活跃时段）
     */
    getTimeFactor() {
        const now = new Date();
        const hour = now.getUTCHours();
        const minute = now.getUTCMinutes();
        
        // MEV 机器人通常在以下时段活跃
        const mevActiveHours = [1, 5, 9, 13, 17, 21];
        const mevActiveMinutes = [0, 15, 30, 45]; // 整点、15分、30分、45分
        
        // 检查是否在 MEV 活跃时段
        const isMEVActiveHour = mevActiveHours.includes(hour);
        const isMEVActiveMinute = mevActiveMinutes.includes(minute);
        
        if (isMEVActiveHour && isMEVActiveMinute) {
            logger.debug(`MEV 活跃时段检测: UTC ${hour}:${minute.toString().padStart(2, '0')}`);
            return 1.5; // 增加滑点保护
        }
        
        return 1.0; // 正常时段
    }
    
    /**
     * 记录滑点计算
     */
    recordSlippageCalculation(data) {
        const key = data.token;
        if (!this.historicalData.has(key)) {
            this.historicalData.set(key, []);
        }
        
        const history = this.historicalData.get(key);
        history.push(data);
        
        // 保持最近100条记录
        if (history.length > 100) {
            history.shift();
        }
    }
    
    /**
     * 获取历史滑点统计
     */
    getHistoricalSlippageStats(token) {
        const history = this.historicalData.get(token) || [];
        
        if (history.length === 0) {
            return null;
        }
        
        const slippages = history.map(h => h.calculatedSlippage);
        const avg = slippages.reduce((a, b) => a + b, 0) / slippages.length;
        const max = Math.max(...slippages);
        const min = Math.min(...slippages);
        
        return {
            token,
            count: history.length,
            average: avg,
            max,
            min,
            lastUpdated: history[history.length - 1].timestamp
        };
    }
    
    /**
     * 优化滑点建议
     */
    getOptimizationSuggestions(tokenData) {
        const suggestions = [];
        
        // 检查波动率
        const volatility = this.calculateVolatility(tokenData);
        if (volatility > 0.5) {
            suggestions.push({
                type: 'high_volatility',
                message: `代币波动率较高: ${(volatility * 100).toFixed(1)}%`,
                recommendation: '考虑增加滑点保护或减少仓位'
            });
        }
        
        // 检查成交量
        if (tokenData.volume24h && tokenData.marketCap) {
            const volumeRatio = tokenData.volume24h / tokenData.marketCap;
            if (volumeRatio > 1.0) {
                suggestions.push({
                    type: 'high_volume',
                    message: `成交量/市值比异常: ${volumeRatio.toFixed(2)}`,
                    recommendation: '可能有大额交易，增加滑点保护'
                });
            }
        }
        
        return suggestions;
    }
    
    /**
     * 生成 MEV 防护报告
     */
    generateProtectionReport(tokenData) {
        return {
            timestamp: Date.now(),
            token: tokenData.symbol || 'unknown',
            baseSlippage: this.config.baseSlippage,
            maxSlippage: this.config.maxSlippage,
            currentFactors: {
                volatility: this.calculateVolatility(tokenData),
                congestion: '待获取',
                timeFactor: this.getTimeFactor()
            },
            historicalStats: this.getHistoricalSlippageStats(tokenData.symbol),
            suggestions: this.getOptimizationSuggestions(tokenData)
        };
    }
}

module.exports = MEVProtection;