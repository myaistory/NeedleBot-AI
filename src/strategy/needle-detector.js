const logger = require('../utils/logger');

class NeedleDetector {
    constructor(config = {}) {
        this.config = {
            minDropPercent: config.minDropPercent || 3,    // 最小跌幅
            minRecoveryPercent: config.minRecoveryPercent || 15, // 最小回升
            lookbackMinutes: config.lookbackMinutes || 5,   // 回看分钟数
            recoverySeconds: config.recoverySeconds || 60,   // 回升秒数
            confidenceThreshold: config.confidenceThreshold || 80, // 置信度阈值
            volumeThreshold: config.volumeThreshold || 10000, // 最小交易量
            ...config
        };
    }

    /**
     * 检测插针信号
     */
    async detectNeedle(priceHistory) {
        if (priceHistory.length < 10) {
            return { hasNeedle: false, reason: '数据不足' };
        }

        try {
            // 1. 计算关键指标
            const analysis = this.analyzePriceHistory(priceHistory);
            
            // 2. 检查插针条件
            const needleCheck = this.checkNeedleConditions(analysis);
            
            // 3. 计算信号置信度
            const confidence = this.calculateConfidence(analysis, needleCheck);
            
            // 4. 综合判断
            const hasNeedle = needleCheck.meetsConditions && 
                            confidence >= this.config.confidenceThreshold &&
                            analysis.volume24h >= this.config.volumeThreshold;

            return {
                hasNeedle,
                confidence,
                analysis: {
                    ...analysis,
                    ...needleCheck
                },
                timestamp: Date.now()
            };
            
        } catch (error) {
            logger.error('插针检测失败:', error);
            return { hasNeedle: false, reason: '检测错误', error: error.message };
        }
    }

    /**
     * 分析价格历史数据
     */
    analyzePriceHistory(prices) {
        if (!prices || prices.length === 0) {
            throw new Error('价格数据为空');
        }

        // 按时间排序（确保最新数据在最后）
        const sortedPrices = [...prices].sort((a, b) => a.timestamp - b.timestamp);
        
        const latestPrice = sortedPrices[sortedPrices.length - 1];
        const oldestPrice = sortedPrices[0];
        
        // 计算统计指标
        const priceValues = sortedPrices.map(p => p.price);
        const volumes = sortedPrices.map(p => p.volume || 0);
        
        const maxPrice = Math.max(...priceValues);
        const minPrice = Math.min(...priceValues);
        const avgPrice = priceValues.reduce((a, b) => a + b, 0) / priceValues.length;
        
        // 计算波动率
        const returns = [];
        for (let i = 1; i < priceValues.length; i++) {
            returns.push((priceValues[i] - priceValues[i-1]) / priceValues[i-1]);
        }
        const volatility = returns.length > 0 ? 
            Math.sqrt(returns.reduce((a, b) => a + b*b, 0) / returns.length) : 0;

        return {
            latestPrice: latestPrice.price,
            oldestPrice: oldestPrice.price,
            maxPrice,
            minPrice,
            avgPrice,
            volatility: volatility * 100, // 转换为百分比
            priceChange: ((latestPrice.price - oldestPrice.price) / oldestPrice.price) * 100,
            volume24h: volumes.reduce((a, b) => a + b, 0),
            dataPoints: sortedPrices.length,
            timeframeMinutes: (latestPrice.timestamp - oldestPrice.timestamp) / (60 * 1000)
        };
    }

    /**
     * 检查插针条件
     */
    checkNeedleConditions(analysis) {
        // 条件1: 在指定时间内出现大幅下跌
        const hasSignificantDrop = analysis.priceChange <= -this.config.minDropPercent;
        
        // 条件2: 在下跌后快速回升
        // 注意：这里简化处理，实际需要更精细的时间序列分析
        const hasQuickRecovery = this.checkQuickRecovery(analysis);
        
        // 条件3: 价格在低位停留时间短（典型的插针特征）
        const hasShortBottomTime = this.checkBottomTime(analysis);
        
        return {
            meetsConditions: hasSignificantDrop && hasQuickRecovery && hasShortBottomTime,
            hasSignificantDrop,
            hasQuickRecovery,
            hasShortBottomTime,
            dropPercentage: Math.abs(analysis.priceChange),
            recoveryEstimate: hasQuickRecovery ? this.config.minRecoveryPercent : 0
        };
    }

    /**
     * 检查快速回升（简化版）
     */
    checkQuickRecovery(analysis) {
        // 简化逻辑：如果价格从最低点有显著回升
        const recoveryFromBottom = ((analysis.latestPrice - analysis.minPrice) / analysis.minPrice) * 100;
        return recoveryFromBottom >= this.config.minRecoveryPercent;
    }

    /**
     * 检查底部停留时间
     */
    checkBottomTime(analysis) {
        // 简化逻辑：如果波动率较高，可能底部停留时间短
        return analysis.volatility > 5; // 波动率大于5%
    }

    /**
     * 计算信号置信度
     */
    calculateConfidence(analysis, needleCheck) {
        let confidence = 50; // 基础置信度
        
        // 1. 跌幅深度加分
        if (needleCheck.dropPercentage > this.config.minDropPercent) {
            const extraDrop = needleCheck.dropPercentage - this.config.minDropPercent;
            confidence += Math.min(extraDrop * 2, 20); // 每多跌1%加2分，最多20分
        }
        
        // 2. 回升幅度加分
        if (needleCheck.recoveryEstimate > this.config.minRecoveryPercent) {
            const extraRecovery = needleCheck.recoveryEstimate - this.config.minRecoveryPercent;
            confidence += Math.min(extraRecovery * 1.5, 15); // 每多回升1%加1.5分，最多15分
        }
        
        // 3. 交易量加分
        if (analysis.volume24h > this.config.volumeThreshold * 10) {
            confidence += 10; // 高交易量加分
        }
        
        // 4. 波动率调整
        if (analysis.volatility > 10) {
            confidence -= 5; // 过高波动率减分
        } else if (analysis.volatility > 5) {
            confidence += 5; // 适当波动率加分
        }
        
        // 5. 数据质量加分
        if (analysis.dataPoints > 20) {
            confidence += 5;
        }
        
        return Math.min(Math.max(confidence, 0), 100); // 限制在0-100之间
    }

    /**
     * 批量检测多个代币
     */
    async batchDetect(tokensWithHistory) {
        const results = [];
        
        for (const { token, history } of tokensWithHistory) {
            try {
                const detection = await this.detectNeedle(history);
                if (detection.hasNeedle) {
                    results.push({
                        token,
                        detection,
                        timestamp: Date.now()
                    });
                }
            } catch (error) {
                logger.error(`代币 ${token.symbol} 检测失败:`, error.message);
            }
        }
        
        return results;
    }

    /**
     * 优化策略参数
     */
    optimizeParameters(historicalData) {
        // 这里可以实现参数优化逻辑
        // 使用历史数据寻找最优参数组合
        logger.info('参数优化功能待实现');
        return this.config;
    }
}

module.exports = NeedleDetector;