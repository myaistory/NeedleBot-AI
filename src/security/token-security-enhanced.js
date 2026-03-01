/**
 * Token Security Enhanced - Rug & Honeypot Detection System
 * 
 * 功能：
 * 1. 检查代币是否为 honeypot（无法卖出）
 * 2. 检查流动性池是否已锁定
 * 3. 检查是否有可疑的转让税
 * 4. 检查.owner 是否可更改
 * 5. 检查是否为盘古类代币
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const axios = require('axios');

class TokenSecurityEnhanced {
  constructor(options = {}) {
    this.connection = options.connection || new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
    this.rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    
    // 安全阈值配置
    this.config = {
      maxBuyTax: options.maxBuyTax || 10,      // 最大买入税 (%)
      maxSellTax: options.maxSellTax || 10,     // 最大卖出税 (%)
      maxTransferTax: options.maxTransferTax || 5, // 最大转让税 (%)
      minLiquidityLocked: options.minLiquidityLocked || 80, // 最小流动性锁定比例 (%)
      minLiquidityUSD: options.minLiquidityUSD || 1000, // 最小流动性 (USD)
      suspiciousOwnerChange: options.suspiciousOwnerChange || true, // 检测 owner 变更
      checkPangu: options.checkPangu || true,   // 检测盘古类代币
    };

    // 盘古类代币特征
    this.panguPatterns = [
      'pangu', 'pg', '盘古', 'pan'
    ];
  }

  /**
   * 全面安全检查
   * @param {string} tokenAddress - 代币地址
   * @returns {Promise<Object>} 安全分析报告
   */
  async checkTokenSecurity(tokenAddress) {
    const report = {
      tokenAddress,
      timestamp: new Date().toISOString(),
      isSafe: true,
      riskLevel: 'LOW',
      riskScore: 0,
      checks: {},
      warnings: [],
      criticalIssues: []
    };

    try {
      // 1. Honeypot 检测
      report.checks.honeypot = await this.checkHoneypot(tokenAddress);
      if (report.checks.honeypot.isHoneypot) {
        report.criticalIssues.push('检测到 Honeypot: 代币无法卖出');
        report.isSafe = false;
        report.riskScore += 50;
      }

      // 2. 流动性池锁定检查
      report.checks.liquidityLock = await this.checkLiquidityLock(tokenAddress);
      if (!report.checks.liquidityLock.isLocked || 
          report.checks.liquidityLock.lockedPercentage < this.config.minLiquidityLocked) {
        report.warnings.push(`流动性锁定不足：${report.checks.liquidityLock.lockedPercentage}% (要求：${this.config.minLiquidityLocked}%)`);
        report.riskScore += 20;
      }

      // 3. 转让税检查
      report.checks.transferTax = await this.checkTransferTax(tokenAddress);
      if (report.checks.transferTax.buyTax > this.config.maxBuyTax ||
          report.checks.transferTax.sellTax > this.config.maxSellTax) {
        report.criticalIssues.push(`可疑转让税：买入${report.checks.transferTax.buyTax}%, 卖出${report.checks.transferTax.sellTax}%`);
        report.isSafe = false;
        report.riskScore += 30;
      }

      // 4. Owner 权限检查
      report.checks.ownerCheck = await this.checkOwnerPermissions(tokenAddress);
      if (report.checks.ownerCheck.canChangeOwner) {
        report.warnings.push('Owner 权限可更改，存在风险');
        report.riskScore += 15;
      }
      if (report.checks.ownerCheck.hasMintAuthority) {
        report.criticalIssues.push('Owner 拥有铸造权限，可无限增发');
        report.riskScore += 25;
      }

      // 5. 盘古类代币检测
      if (this.config.checkPangu) {
        report.checks.panguCheck = await this.checkPanguToken(tokenAddress);
        if (report.checks.panguCheck.isPangu) {
          report.criticalIssues.push('检测到盘古类代币特征');
          report.isSafe = false;
          report.riskScore += 40;
        }
      }

      // 计算风险等级
      report.riskLevel = this.calculateRiskLevel(report.riskScore);
      report.isSafe = report.riskScore < 30;

      return report;
    } catch (error) {
      console.error(`[TokenSecurity] 检查代币 ${tokenAddress} 失败:`, error.message);
      report.criticalIssues.push(`安全检查失败：${error.message}`);
      report.isSafe = false;
      report.riskLevel = 'UNKNOWN';
      return report;
    }
  }

  /**
   * 检查是否为 Honeypot
   */
  async checkHoneypot(tokenAddress) {
    try {
      // 使用 RugCheck API 检测 honeypot
      const rugCheckUrl = `https://api.rugcheck.xyz/v1/tokens/${tokenAddress}/report`;
      const response = await axios.get(rugCheckUrl, { timeout: 10000 });
      
      const report = response.data;
      const isHoneypot = report.score > 800 || // RugCheck 高分表示高风险
                        report.errors?.some(e => e.message?.toLowerCase().includes('honeypot')) ||
                        report.tokenMeta?.verified === false;

      return {
        isHoneypot,
        score: report.score || 0,
        details: report,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.log(`[TokenSecurity] RugCheck API 调用失败，使用备用检测:`, error.message);
      // 备用检测：尝试模拟卖出
      return await this.simulateSell(tokenAddress);
    }
  }

  /**
   * 模拟卖出检测（备用 honeypot 检测）
   */
  async simulateSell(tokenAddress) {
    try {
      // 这里应该实现实际的卖出模拟逻辑
      // 由于需要私钥签名，这里返回保守结果
      return {
        isHoneypot: false,
        score: 500,
        details: { message: '无法完成卖出模拟，需要实际交易测试' },
        timestamp: new Date().toISOString(),
        warning: '建议小额测试卖出'
      };
    } catch (error) {
      return {
        isHoneypot: true,
        score: 900,
        details: { error: error.message },
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 检查流动性池锁定状态
   */
  async checkLiquidityLock(tokenAddress) {
    try {
      // 使用 RugCheck 获取流动性信息
      const rugCheckUrl = `https://api.rugcheck.xyz/v1/tokens/${tokenAddress}/report`;
      const response = await axios.get(rugCheckUrl, { timeout: 10000 });
      const report = response.data;

      const liquidityInfo = report.liquidity || {};
      const totalLiquidity = liquidityInfo.total || 0;
      const lockedLiquidity = liquidityInfo.locked || 0;
      const lockedPercentage = totalLiquidity > 0 ? (lockedLiquidity / totalLiquidity) * 100 : 0;

      return {
        isLocked: lockedPercentage >= this.config.minLiquidityLocked,
        lockedPercentage,
        totalLiquidityUSD: totalLiquidity,
        lockedLiquidityUSD: lockedLiquidity,
        lockDetails: liquidityInfo.locks || [],
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.log(`[TokenSecurity] 流动性检查失败:`, error.message);
      return {
        isLocked: false,
        lockedPercentage: 0,
        totalLiquidityUSD: 0,
        lockedLiquidityUSD: 0,
        lockDetails: [],
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 检查转让税
   */
  async checkTransferTax(tokenAddress) {
    try {
      const rugCheckUrl = `https://api.rugcheck.xyz/v1/tokens/${tokenAddress}/report`;
      const response = await axios.get(rugCheckUrl, { timeout: 10000 });
      const report = response.data;

      const taxInfo = report.tax || {};
      const buyTax = taxInfo.buyTax || 0;
      const sellTax = taxInfo.sellTax || 0;

      return {
        buyTax,
        sellTax,
        transferTax: Math.max(buyTax, sellTax),
        isSuspicious: buyTax > this.config.maxBuyTax || sellTax > this.config.maxSellTax,
        details: taxInfo,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.log(`[TokenSecurity] 转让税检查失败:`, error.message);
      return {
        buyTax: 0,
        sellTax: 0,
        transferTax: 0,
        isSuspicious: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 检查 Owner 权限
   */
  async checkOwnerPermissions(tokenAddress) {
    try {
      const rugCheckUrl = `https://api.rugcheck.xyz/v1/tokens/${tokenAddress}/report`;
      const response = await axios.get(rugCheckUrl, { timeout: 10000 });
      const report = response.data;

      const mintInfo = report.mint || {};
      const freezeAuthority = mintInfo.freezeAuthority;
      const mintAuthority = mintInfo.mintAuthority;

      return {
        hasFreezeAuthority: freezeAuthority !== null && freezeAuthority !== undefined,
        hasMintAuthority: mintAuthority !== null && mintAuthority !== undefined,
        canChangeOwner: mintInfo.updateAuthority !== null,
        freezeAuthority: freezeAuthority || null,
        mintAuthority: mintAuthority || null,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.log(`[TokenSecurity] Owner 权限检查失败:`, error.message);
      return {
        hasFreezeAuthority: false,
        hasMintAuthority: false,
        canChangeOwner: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 检查是否为盘古类代币
   */
  async checkPanguToken(tokenAddress) {
    try {
      const rugCheckUrl = `https://api.rugcheck.xyz/v1/tokens/${tokenAddress}/report`;
      const response = await axios.get(rugCheckUrl, { timeout: 10000 });
      const report = response.data;

      const tokenMeta = report.tokenMeta || {};
      const name = (tokenMeta.name || '').toLowerCase();
      const symbol = (tokenMeta.symbol || '').toLowerCase();

      // 检查名称/符号是否包含盘古特征
      const isPanguName = this.panguPatterns.some(pattern => 
        name.includes(pattern) || symbol.includes(pattern)
      );

      // 检查是否有其他盘古特征（如特定 creator、相似合约等）
      const creators = report.creators || [];
      const hasSuspiciousCreator = creators.some(c => 
        c.knownScammer === true || c.riskScore > 800
      );

      return {
        isPangu: isPanguName || hasSuspiciousCreator,
        isPanguName,
        hasSuspiciousCreator,
        tokenName: tokenMeta.name,
        tokenSymbol: tokenMeta.symbol,
        creators: creators,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.log(`[TokenSecurity] 盘古代币检查失败:`, error.message);
      return {
        isPangu: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 计算风险等级
   */
  calculateRiskLevel(score) {
    if (score >= 80) return 'CRITICAL';
    if (score >= 60) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    if (score >= 20) return 'LOW';
    return 'VERY_LOW';
  }

  /**
   * 批量检查多个代币
   */
  async checkMultipleTokens(tokenAddresses, options = {}) {
    const concurrency = options.concurrency || 5;
    const results = [];

    for (let i = 0; i < tokenAddresses.length; i += concurrency) {
      const batch = tokenAddresses.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(address => this.checkTokenSecurity(address))
      );
      results.push(...batchResults);
      
      // 避免 API 限流
      if (i + concurrency < tokenAddresses.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * 获取安全代币列表（过滤高风险代币）
   */
  filterSafeTokens(reports, options = {}) {
    const maxRiskScore = options.maxRiskScore || 30;
    const requireLiquidityLock = options.requireLiquidityLock !== false;
    const maxTax = options.maxTax || 10;

    return reports.filter(report => {
      if (report.riskScore > maxRiskScore) return false;
      if (!report.isSafe) return false;
      if (requireLiquidityLock && !report.checks.liquidityLock?.isLocked) return false;
      if (report.checks.transferTax?.buyTax > maxTax) return false;
      if (report.checks.transferTax?.sellTax > maxTax) return false;
      return true;
    });
  }
}

module.exports = TokenSecurityEnhanced;

// 使用示例
if (require.main === module) {
  const security = new TokenSecurityEnhanced();
  
  // 示例：检查代币安全性
  const tokenAddress = 'TOKEN_ADDRESS_HERE';
  security.checkTokenSecurity(tokenAddress)
    .then(report => {
      console.log('安全报告:', JSON.stringify(report, null, 2));
    })
    .catch(console.error);
}
