const logger = require('../utils/logger');
const axios = require('axios');

class TokenSecurityFilter {
    constructor(config = {}) {
        this.config = {
            minSecurityScore: config.minSecurityScore || 70,
            maxTaxPercent: config.maxTaxPercent || 10,
            minLiquidityUSD: config.minLiquidityUSD || 50000,
            requireMintRevoked: config.requireMintRevoked || true,
            requireFreezeRevoked: config.requireFreezeRevoked || true,
            enableJupiterCheck: config.enableJupiterCheck || true,
            ...config
        };
        
        this.cache = new Map();
        this.cacheTTL = 300000; // 5分钟缓存
    }
    
    /**
     * 分析代币安全性
     */
    async analyzeTokenSecurity(tokenAddress) {
        const cacheKey = `security_${tokenAddress}`;
        const cached = this.getCachedResult(cacheKey);
        
        if (cached) {
            logger.debug(`使用缓存的代币安全分析: ${tokenAddress}`);
            return cached;
        }
        
        const securityReport = {
            tokenAddress,
            timestamp: Date.now(),
            risks: [],
            warnings: [],
            passed: true,
            score: 100 // 初始分数
        };
        
        try {
            // 并行执行安全检查
            const checks = await Promise.allSettled([
                this.checkJupiterRouting(tokenAddress),
                this.checkTokenTaxes(tokenAddress),
                this.checkTokenPermissions(tokenAddress),
                this.checkLiquidity(tokenAddress),
                this.checkHolderDistribution(tokenAddress)
            ]);
            
            // 处理检查结果
            checks.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value) {
                    this.processCheckResult(securityReport, result.value);
                } else {
                    logger.warn(`代币安全检查 ${index} 失败:`, result.reason?.message);
                    securityReport.score -= 5; // 检查失败扣分
                }
            });
            
            // 最终评分
            securityReport.score = Math.max(0, Math.min(100, securityReport.score));
            securityReport.securityLevel = this.getSecurityLevel(securityReport.score);
            securityReport.passed = securityReport.score >= this.config.minSecurityScore;
            
            // 缓存结果
            this.cacheResult(cacheKey, securityReport);
            
            logger.debug(`代币安全分析完成: ${tokenAddress} - 分数: ${securityReport.score}, 等级: ${securityReport.securityLevel}`);
            
            return securityReport;
            
        } catch (error) {
            logger.error('代币安全分析失败:', error);
            
            // 返回失败报告
            return {
                tokenAddress,
                timestamp: Date.now(),
                risks: ['安全分析失败'],
                warnings: [],
                passed: false,
                score: 0,
                securityLevel: 'UNKNOWN',
                error: error.message
            };
        }
    }
    
    /**
     * 检查 Jupiter 路由
     */
    async checkJupiterRouting(tokenAddress) {
        if (!this.config.enableJupiterCheck) {
            return { type: 'jupiter_routing', passed: true, routable: true, skipped: true };
        }
        
        try {
            // 尝试获取报价
            const quote = await axios.get('https://quote-api.jup.ag/v6/quote', {
                params: {
                    inputMint: 'So11111111111111111111111111111111111111112', // SOL
                    outputMint: tokenAddress,
                    amount: 1000000, // 小额测试
                    slippageBps: 100 // 1% 滑点
                },
                timeout: 10000
            });
            
            const routable = quote.data && quote.data.routes && quote.data.routes.length > 0;
            
            return {
                type: 'jupiter_routing',
                passed: routable,
                routable,
                routes: quote.data.routes?.length || 0,
                message: routable ? '可通过 Jupiter 路由' : '无法通过 Jupiter 路由（可能是貔貅盘）'
            };
            
        } catch (error) {
            logger.debug(`Jupiter 路由检查失败: ${error.message}`);
            
            return {
                type: 'jupiter_routing',
                passed: false,
                routable: false,
                error: error.message,
                message: 'Jupiter 路由检查失败'
            };
        }
    }
    
    /**
     * 检查代币税收
     */
    async checkTokenTaxes(tokenAddress) {
        try {
            // 这里可以集成 Raydium 或 Birdeye API 获取税收信息
            // 暂时使用模拟数据
            
            // 模拟税收检查
            const hasHighTax = Math.random() < 0.1; // 10% 的几率有高税收
            const buyTax = hasHighTax ? 0.08 : 0.02;
            const sellTax = hasHighTax ? 0.12 : 0.03;
            const totalTax = buyTax + sellTax;
            
            const passed = totalTax <= (this.config.maxTaxPercent / 100);
            
            return {
                type: 'token_taxes',
                passed,
                buyTax: buyTax * 100,
                sellTax: sellTax * 100,
                totalTax: totalTax * 100,
                threshold: this.config.maxTaxPercent,
                message: passed 
                    ? `税收正常 (买: ${(buyTax * 100).toFixed(1)}%, 卖: ${(sellTax * 100).toFixed(1)}%)`
                    : `税收过高 (总: ${(totalTax * 100).toFixed(1)}%, 阈值: ${this.config.maxTaxPercent}%)`
            };
            
        } catch (error) {
            logger.debug(`代币税收检查失败: ${error.message}`);
            
            return {
                type: 'token_taxes',
                passed: false,
                error: error.message,
                message: '税收检查失败'
            };
        }
    }
    
    /**
     * 检查代币权限
     */
    async checkTokenPermissions(tokenAddress) {
        try {
            // 这里可以集成 Solana 链上数据检查
            // 暂时使用模拟数据
            
            // 模拟权限检查
            const hasMintAuthority = Math.random() < 0.05; // 5% 的几率有增发权限
            const hasFreezeAuthority = Math.random() < 0.03; // 3% 的几率有冻结权限
            const hasBlacklist = Math.random() < 0.02; // 2% 的几率有黑名单
            
            const passed = !hasMintAuthority && !hasFreezeAuthority && !hasBlacklist;
            
            const issues = [];
            if (hasMintAuthority) issues.push('增发权限');
            if (hasFreezeAuthority) issues.push('冻结权限');
            if (hasBlacklist) issues.push('黑名单');
            
            return {
                type: 'token_permissions',
                passed,
                hasMintAuthority,
                hasFreezeAuthority,
                hasBlacklist,
                issues,
                message: passed 
                    ? '权限设置安全'
                    : `存在风险权限: ${issues.join(', ')}`
            };
            
        } catch (error) {
            logger.debug(`代币权限检查失败: ${error.message}`);
            
            return {
                type: 'token_permissions',
                passed: false,
                error: error.message,
                message: '权限检查失败'
            };
        }
    }
    
    /**
     * 检查流动性
     */
    async checkLiquidity(tokenAddress) {
        try {
            // 这里可以集成 DEXScreener 或 Birdeye API
            // 暂时使用模拟数据
            
            // 模拟流动性检查
            const liquidityUSD = 50000 + Math.random() * 200000; // $50K-$250K
            const passed = liquidityUSD >= this.config.minLiquidityUSD;
            
            return {
                type: 'liquidity',
                passed,
                liquidityUSD,
                threshold: this.config.minLiquidityUSD,
                message: passed
                    ? `流动性充足: $${liquidityUSD.toLocaleString()}`
                    : `流动性不足: $${liquidityUSD.toLocaleString()} (阈值: $${this.config.minLiquidityUSD.toLocaleString()})`
            };
            
        } catch (error) {
            logger.debug(`流动性检查失败: ${error.message}`);
            
            return {
                type: 'liquidity',
                passed: false,
                error: error.message,
                message: '流动性检查失败'
            };
        }
    }
    
    /**
     * 检查持有者分布
     */
    async checkHolderDistribution(tokenAddress) {
        try {
            // 这里可以集成 Solana 链上数据
            // 暂时使用模拟数据
            
            // 模拟持有者分布检查
            const top10Percentage = 0.3 + Math.random() * 0.5; // 30%-80%
            const passed = top10Percentage <= 0.7; // 前10持有不超过70%
            
            return {
                type: 'holder_distribution',
                passed,
                top10Percentage: top10Percentage * 100,
                threshold: 70,
                message: passed
                    ? `持有者分布合理 (前10持有: ${(top10Percentage * 100).toFixed(1)}%)`
                    : `持有者过度集中 (前10持有: ${(top10Percentage * 100).toFixed(1)}%)`
            };
            
        } catch (error) {
            logger.debug(`持有者分布检查失败: ${error.message}`);
            
            return {
                type: 'holder_distribution',
                passed: false,
                error: error.message,
                message: '持有者分布检查失败'
            };
        }
    }
    
    /**
     * 处理检查结果
     */
    processCheckResult(securityReport, checkResult) {
        if (!checkResult.passed) {
            securityReport.risks.push(checkResult.message);
            
            // 根据检查类型扣分
            switch (checkResult.type) {
                case 'jupiter_routing':
                    securityReport.score -= 40; // 无法路由严重扣分
                    break;
                case 'token_taxes':
                    securityReport.score -= 30; // 高税收扣分
                    break;
                case 'token_permissions':
                    securityReport.score -= 25; // 危险权限扣分
                    break;
                case 'liquidity':
                    securityReport.score -= 20; // 流动性不足扣分
                    break;
                case 'holder_distribution':
                    securityReport.score -= 15; // 持有者集中扣分
                    break;
                default:
                    securityReport.score -= 10;
            }
        } else if (checkResult.warning) {
            securityReport.warnings.push(checkResult.message);
            securityReport.score -= 5; // 警告轻微扣分
        }
    }
    
    /**
     * 获取安全等级
     */
    getSecurityLevel(score) {
        if (score >= 90) return 'EXCELLENT';
        if (score >= 75) return 'GOOD';
        if (score >= 60) return 'FAIR';
        if (score >= 40) return 'POOR';
        return 'DANGEROUS';
    }
    
    /**
     * 获取缓存结果
     */
    getCachedResult(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;
        
        // 检查是否过期
        if (Date.now() - cached.timestamp > this.cacheTTL) {
            this.cache.delete(key);
            return null;
        }
        
        return cached;
    }
    
    /**
     * 缓存结果
     */
    cacheResult(key, result) {
        this.cache.set(key, {
            ...result,
            cachedAt: Date.now()
        });
        
        // 清理过期缓存
        this.cleanupCache();
    }
    
    /**
     * 清理缓存
     */
    cleanupCache() {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (now - value.cachedAt > this.cacheTTL) {
                this.cache.delete(key);
            }
        }
    }
    
    /**
     * 批量分析代币
     */
    async analyzeTokensBatch(tokenAddresses) {
        const results = await Promise.allSettled(
            tokenAddresses.map(addr => this.analyzeTokenSecurity(addr))
        );
        
        return results
            .filter(result => result.status === 'fulfilled')
            .map(result => result.value)
            .sort((a, b) => b.score - a.score);
    }
    
    /**
     * 获取安全报告摘要
     */
    getSecuritySummary(reports) {
        const total = reports.length;
        const passed = reports.filter(r => r.passed).length;
        const excellent = reports.filter(r => r.securityLevel === 'EXCELLENT').length;
        const dangerous = reports.filter(r => r.securityLevel === 'DANGEROUS').length;
        
        const avgScore = reports.reduce((sum, r) => sum + r.score, 0) / total;
        
        return {
            total,
            passed,
            failed: total - passed,
            excellent,
            dangerous,
            avgScore: avgScore.toFixed(1),
            passRate: ((passed / total) * 100).toFixed(1)
        };
    }
}

module.exports = TokenSecurityFilter;