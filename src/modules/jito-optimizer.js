/**
 * Jito Tip Optimizer - 动态Jito小费优化策略
 * 根据链上拥堵程度动态调整小费，确保交易优先执行
 */

const axios = require('axios');

class JitoTipOptimizer {
    constructor() {
        // 配置
        this.config = {
            minTip: 0.0001,      // 最小小费 0.0001 SOL
            maxTip: 0.005,       // 最大小费 0.005 SOL
            defaultTip: 0.0005,  // 默认小费
            rpcEndpoint: 'https://api.mainnet-beta.solana.com'
        };
        
        // 缓存
        this.feeHistory = [];
    }

    // 获取当前优先级费用
    async getRecentPrioritizationFees() {
        try {
            const response = await axios.post(this.config.rpcEndpoint, {
                jsonrpc: '2.0',
                id: 1,
                method: 'getRecentPrioritizationFees',
                params: []
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 5000
            });
            
            if (response.data?.result) {
                return response.data.result.map(fee => ({
                    slot: fee.slot,
                    minFee: fee.minFee / 1e9, // 转换为 SOL
                    maxFee: fee.maxFee / 1e9
                }));
            }
            return null;
        } catch (error) {
            console.error('[JitoTip] 获取费用失败:', error.message);
            return null;
        }
    }

    // 计算动态小费
    async calculateOptimalTip(urgency = 'normal') {
        // 获取链上费用数据
        const fees = await this.getRecentPrioritizationFees();
        
        let baseFee = this.config.defaultTip;
        let congestionLevel = 'LOW';
        
        if (fees && fees.length > 0) {
            // 计算平均费用
            const avgFee = fees.reduce((a, b) => a + b.maxFee, 0) / fees.length;
            
            // 根据平均费用判断拥堵程度
            if (avgFee > 0.001) {
                congestionLevel = 'HIGH';
                baseFee = Math.max(avgFee * 1.5, this.config.minTip);
            } else if (avgFee > 0.0005) {
                congestionLevel = 'MEDIUM';
                baseFee = Math.max(avgFee * 1.2, this.config.minTip);
            } else {
                congestionLevel = 'LOW';
                baseFee = this.config.minTip;
            }
        }
        
        // 根据紧急程度调整
        let finalTip;
        switch (urgency) {
            case 'high':
                finalTip = baseFee * 2;
                break;
            case 'low':
                finalTip = baseFee * 0.8;
                break;
            default:
                finalTip = baseFee;
        }
        
        // 限制范围
        finalTip = Math.max(
            this.config.minTip, 
            Math.min(finalTip, this.config.maxTip)
        );
        
        return {
            tip: finalTip.toFixed(6),
            congestion: congestionLevel,
            baseFee: baseFee.toFixed(6),
            urgency: urgency,
            recommendation: this.getRecommendation(congestionLevel, urgency)
        };
    }

    // 获取建议
    getRecommendation(congestion, urgency) {
        if (congestion === 'HIGH' && urgency === 'high') {
            return '使用高优先级Jito Bundle，确保交易排在区块最前面';
        }
        if (congestion === 'HIGH') {
            return '建议等待或提高小费';
        }
        return '正常执行，使用标准小费';
    }

    // 预估交易成本
    async estimateCost(urgency = 'normal') {
        const tipInfo = await this.calculateOptimalTip(urgency);
        
        return {
            jitoTip: tipInfo.tip,
            estimatedTotal: (parseFloat(tipInfo.tip) + 0.0005).toFixed(6), // + 基础gas
            congestion: tipInfo.congestion,
            recommendation: tipInfo.recommendation
        };
    }
}

module.exports = JitoTipOptimizer;
