const axios = require('axios');
const logger = require('../utils/logger');

class RiskManager {
    constructor(config = {}) {
        this.config = {
            rugCheckEnabled: config.rugCheckEnabled !== false,
            minLiquidityUSD: config.minLiquidityUSD || 10000,
            requireLPLock: config.requireLPLock !== false,
            requireMintRevoked: config.requireMintRevoked !== false,
            maxPositionSizeSOL: config.maxPositionSizeSOL || 0.1,
            maxDailyLossPercent: config.maxDailyLossPercent || 10,
            maxDailyTrades: config.maxDailyTrades || 20,
            cooldownMinutes: config.cooldownMinutes || 5,
            ...config
        };
        
        this.dailyStats = {
            trades: 0,
            profitLoss: 0,
            startTime: Date.now(),
            lastTradeTime: 0
        };
        
        this.tokenBlacklist = new Set();
    }

    /**
     * 全面风险评估
     */
    async assessRisk(tokenAddress, signal, tradeAmount) {
        const assessments = [];
        
        // 1. 项目级风控
        const projectRisk = await this.assessProjectRisk(tokenAddress);
        assessments.push(projectRisk);
        
        // 2. 交易级风控
        const tradeRisk = this.assessTradeRisk(signal, tradeAmount);
        assessments.push(tradeRisk);
        
        // 3. 系统级风控
        const systemRisk = this.assessSystemRisk();
        assessments.push(systemRisk);
        
        // 4. 黑名单检查
        const blacklistRisk = this.checkBlacklist(tokenAddress);
        assessments.push(blacklistRisk);
        
        // 综合风险评估
        const overallRisk = this.calculateOverallRisk(assessments);
        
        return {
            approved: overallRisk.approved,
            riskLevel: overallRisk.level,
            score: overallRisk.score,
            assessments,
            recommendations: overallRisk.recommendations,
            timestamp: Date.now()
        };
    }

    /**
     * 项目级风险评估
     */
    async assessProjectRisk(tokenAddress) {
        const checks = [];
        
        // 1. RugCheck 验证
        if (this.config.rugCheckEnabled) {
            const rugCheck = await this.performRugCheck(tokenAddress);
            checks.push(rugCheck);
        }
        
        // 2. 流动性检查
        const liquidityCheck = await this.checkLiquidity(tokenAddress);
        checks.push(liquidityCheck);
        
        // 3. LP 锁定检查
        if (this.config.requireLPLock) {
            const lpLockCheck = await this.checkLPLock(tokenAddress);
            checks.push(lpLockCheck);
        }
        
        // 4. Mint 权限检查
        if (this.config.requireMintRevoked) {
            const mintCheck = await this.checkMintAuthority(tokenAddress);
            checks.push(mintCheck);
        }
        
        return {
            type: 'project',
            checks,
            approved: checks.every(c => c.passed),
            failedChecks: checks.filter(c => !c.passed).map(c => c.name)
        };
    }

    /**
     * 执行 RugCheck
     */
    async performRugCheck(tokenAddress) {
        try {
            // 使用 RugCheck API 或类似服务
            const response = await axios.get(
                `https://api.rugcheck.xyz/v1/tokens/${tokenAddress}/report`
            );
            
            const data = response.data;
            const riskScore = data.riskScore || 100;
            
            return {
                name: 'rug_check',
                passed: riskScore <= 30, // 风险分数低于30为安全
                score: riskScore,
                details: data
            };
        } catch (error) {
            logger.warn(`RugCheck 失败: ${error.message}`);
            return {
                name: 'rug_check',
                passed: false, // 检查失败时保守处理
                score: 100,
                details: { error: error.message }
            };
        }
    }

    /**
     * 检查流动性
     */
    async checkLiquidity(tokenAddress) {
        try {
            // 使用 DEXScreener 获取流动性数据
            const response = await axios.get(
                `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`
            );
            
            if (response.data.pairs && response.data.pairs.length > 0) {
                const pair = response.data.pairs[0];
                const liquidity = parseFloat(pair.liquidity?.usd || 0);
                
                return {
                    name: 'liquidity_check',
                    passed: liquidity >= this.config.minLiquidityUSD,
                    liquidityUSD: liquidity,
                    threshold: this.config.minLiquidityUSD,
                    details: pair
                };
            }
        } catch (error) {
            logger.warn(`流动性检查失败: ${error.message}`);
        }
        
        return {
            name: 'liquidity_check',
            passed: false,
            liquidityUSD: 0,
            threshold: this.config.minLiquidityUSD,
            details: { error: '检查失败' }
        };
    }

    /**
     * 检查 LP 锁定
     */
    async checkLPLock(tokenAddress) {
        try {
            // 简化实现：检查是否有 LP 锁定记录
            // 实际需要查询链上数据
            const response = await axios.get(
                `https://api.rugcheck.xyz/v1/tokens/${tokenAddress}/lp-lock`
            );
            
            const isLocked = response.data?.isLocked || false;
            const lockTime = response.data?.lockTime || 0;
            
            return {
                name: 'lp_lock_check',
                passed: isLocked && lockTime > Date.now(),
                isLocked,
                lockTime,
                details: response.data
            };
        } catch (error) {
            logger.warn(`LP锁定检查失败: ${error.message}`);
            return {
                name: 'lp_lock_check',
                passed: false,
                isLocked: false,
                lockTime: 0,
                details: { error: error.message }
            };
        }
    }

    /**
     * 检查 Mint 权限
     */
    async checkMintAuthority(tokenAddress) {
        try {
            // 简化实现：检查 Mint 权限是否已撤销
            const response = await axios.get(
                `https://api.rugcheck.xyz/v1/tokens/${tokenAddress}/mint-authority`
            );
            
            const isRevoked = response.data?.isRevoked || false;
            
            return {
                name: 'mint_authority_check',
                passed: isRevoked,
                isRevoked,
                details: response.data
            };
        } catch (error) {
            logger.warn(`Mint权限检查失败: ${error.message}`);
            return {
                name: 'mint_authority_check',
                passed: false,
                isRevoked: false,
                details: { error: error.message }
            };
        }
    }

    /**
     * 交易级风险评估
     */
    assessTradeRisk(signal, tradeAmount) {
        const checks = [];
        
        // 1. 信号强度检查
        checks.push({
            name: 'signal_strength',
            passed: signal.confidence >= 80,
            confidence: signal.confidence,
            threshold: 80
        });
        
        // 2. 仓位大小检查
        checks.push({
            name: 'position_size',
            passed: tradeAmount <= this.config.maxPositionSizeSOL,
            amount: tradeAmount,
            maxAmount: this.config.maxPositionSizeSOL
        });
        
        // 3. 冷却时间检查
        const timeSinceLastTrade = Date.now() - this.dailyStats.lastTradeTime;
        const cooldownMs = this.config.cooldownMinutes * 60 * 1000;
        checks.push({
            name: 'cooldown',
            passed: timeSinceLastTrade >= cooldownMs,
            timeSinceLastTrade: timeSinceLastTrade / 1000,
            requiredCooldown: this.config.cooldownMinutes * 60
        });
        
        // 4. 每日交易次数限制
        checks.push({
            name: 'daily_trades',
            passed: this.dailyStats.trades < this.config.maxDailyTrades,
            currentTrades: this.dailyStats.trades,
            maxTrades: this.config.maxDailyTrades
        });
        
        // 5. 每日损失限制
        const maxDailyLoss = (this.dailyStats.profitLoss < 0) ? 
            Math.abs(this.dailyStats.profitLoss) : 0;
        const maxAllowedLoss = this.config.maxDailyLossPercent / 100;
        checks.push({
            name: 'daily_loss',
            passed: maxDailyLoss < maxAllowedLoss,
            currentLoss: maxDailyLoss,
            maxLoss: maxAllowedLoss
        });
        
        return {
            type: 'trade',
            checks,
            approved: checks.every(c => c.passed),
            failedChecks: checks.filter(c => !c.passed).map(c => c.name)
        };
    }

    /**
     * 系统级风险评估
     */
    assessSystemRisk() {
        const checks = [];
        
        // 1. 系统运行时间
        const uptimeHours = (Date.now() - this.dailyStats.startTime) / (1000 * 60 * 60);
        checks.push({
            name: 'system_uptime',
            passed: uptimeHours > 1, // 至少运行1小时
            uptimeHours,
            threshold: 1
        });
        
        // 2. API 可用性（简化检查）
        checks.push({
            name: 'api_availability',
            passed: true, // 实际需要检查各API端点
            details: '待实现'
        });
        
        // 3. 网络延迟检查
        checks.push({
            name: 'network_latency',
            passed: true, // 实际需要测量RPC延迟
            details: '待实现'
        });
        
        return {
            type: 'system',
            checks,
            approved: checks.every(c => c.passed),
            failedChecks: checks.filter(c => !c.passed).map(c => c.name)
        };
    }

    /**
     * 检查黑名单
     */
    checkBlacklist(tokenAddress) {
        const isBlacklisted = this.tokenBlacklist.has(tokenAddress);
        
        return {
            type: 'blacklist',
            approved: !isBlacklisted,
            isBlacklisted,
            details: isBlacklisted ? '代币在黑名单中' : '代币未在黑名单中'
        };
    }

    /**
     * 添加代币到黑名单
     */
    addToBlacklist(tokenAddress, reason) {
        this.tokenBlacklist.add(tokenAddress);
        logger.warn(`代币 ${tokenAddress} 已加入黑名单: ${reason}`);
    }

    /**
     * 计算综合风险
     */
    calculateOverallRisk(assessments) {
        let score = 100; // 起始分数
        const recommendations = [];
        let criticalFailures = 0;
        
        for (const assessment of assessments) {
            if (!assessment.approved) {
                score -= 25; // 每个未通过的评估扣25分
                
                if (assessment.type === 'project') {
                    criticalFailures++;
                    recommendations.push(`项目风险: ${assessment.failedChecks.join(', ')} 检查未通过`);
                } else if (assessment.type === 'trade') {
                    recommendations.push(`交易限制: ${assessment.failedChecks.join(', ')}`);
                }
            }
        }
        
        const approved = score >= 50 && criticalFailures === 0;
        const level = this.getRiskLevel(score);
        
        if (!approved) {
            recommendations.push('综合风险评估未通过');
        }
        
        return {
            approved,
            score: Math.max(0, score),
            level,
            recommendations
        };
    }

    /**
     * 获取风险等级
     */
    getRiskLevel(score) {
        if (score >= 80) return '低风险';
        if (score >= 60) return '中风险';
        if (score >= 40) return '高风险';
        return '极高风险';
    }

    /**
     * 更新交易统计
     */
    updateTradeStats(profitLoss) {
        this.dailyStats.trades++;
        this.dailyStats.profitLoss += profitLoss;
        this.dailyStats.lastTradeTime = Date.now();
        
        // 每日重置
        const now = Date.now();
        const dayInMs = 24 * 60 * 60 * 1000;
        if (now - this.dailyStats.startTime > dayInMs) {
            this.resetDailyStats();
        }
    }

    /**
     * 重置每日统计
     */
    resetDailyStats() {
        this.dailyStats = {
            trades: 0,
            profitLoss: 0,
            startTime: Date.now(),
            lastTradeTime: 0
        };
        logger.info('每日统计已重置');
    }
}

module.exports = RiskManager;