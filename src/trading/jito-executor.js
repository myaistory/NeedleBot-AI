/**
 * Jito Executor - Jito Bundle API 智能执行
 * 
 * 功能：
 * 1. 集成 Jito Bundle API
 * 2. 设置合理的 tip（0.001-0.005 SOL）
 * 3. 失败重试机制
 * 4. 防 MEV 保护
 */

const { Connection, PublicKey, Transaction, VersionedTransaction } = require('@solana/web3.js');
const axios = require('axios');
const bs58 = require('bs58');

class JitoExecutor {
  constructor(options = {}) {
    this.connection = options.connection || new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
    this.wallet = options.wallet; // 需要传入钱包密钥对
    
    // Jito 配置
    this.config = {
      // Jito Block Engine URLs
      blockEngineUrls: options.blockEngineUrls || [
        'https://mainnet.block-engine.jito.wtf',
        'https://amsterdam.mainnet.block-engine.jito.wtf',
        'https://frankfurt.mainnet.block-engine.jito.wtf',
        'https://ny.mainnet.block-engine.jito.wtf',
        'https://tokyo.mainnet.block-engine.jito.wtf'
      ],
      
      // Tip 配置 (SOL)
      minTip: options.minTip || 0.001,
      maxTip: options.maxTip || 0.005,
      defaultTip: options.defaultTip || 0.002,
      tipMultiplier: options.tipMultiplier || 1.5, // 失败时增加 tip 的倍数
      
      // 重试配置
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000, // ms
      bundleTimeout: options.bundleTimeout || 30000, // ms
      
      // MEV 保护
      mevProtection: options.mevProtection !== false,
      usePrivateRpc: options.usePrivateRpc || true,
    };

    // 当前使用的 Block Engine
    this.currentBlockEngine = null;
    this.authToken = options.jitoAuthToken || process.env.JITO_AUTH_TOKEN;
    
    // 统计信息
    this.stats = {
      totalBundles: 0,
      successfulBundles: 0,
      failedBundles: 0,
      totalTips: 0,
      averageTip: 0
    };
  }

  /**
   * 执行交易（使用 Jito Bundle）
   * @param {Transaction|VersionedTransaction} transaction - 交易对象
   * @param {Object} options - 执行选项
   * @returns {Promise<Object>} 执行结果
   */
  async execute(transaction, options = {}) {
    const tip = options.tip || this.config.defaultTip;
    const maxRetries = options.maxRetries || this.config.maxRetries;
    
    let lastError = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        console.log(`[JitoExecutor] 尝试执行交易 (第 ${attempt + 1}/${maxRetries} 次)`);
        
        // 构建 Bundle
        const bundle = await this.buildBundle(transaction, tip);
        
        // 发送 Bundle
        const result = await this.sendBundle(bundle);
        
        if (result.success) {
          this.stats.successfulBundles++;
          this.stats.totalTips += tip;
          this.updateAverageTip();
          
          return {
            success: true,
            bundleId: result.bundleId,
            signature: result.signature,
            tip,
            attempt: attempt + 1,
            timestamp: new Date().toISOString()
          };
        }
        
        lastError = new Error(result.error || 'Bundle 执行失败');
        
      } catch (error) {
        console.error(`[JitoExecutor] 执行失败 (第 ${attempt + 1} 次):`, error.message);
        lastError = error;
      }
      
      // 重试前等待
      if (attempt < maxRetries - 1) {
        const delay = this.config.retryDelay * Math.pow(2, attempt); // 指数退避
        console.log(`[JitoExecutor] 等待 ${delay}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    this.stats.failedBundles++;
    throw lastError;
  }

  /**
   * 构建 Jito Bundle
   */
  async buildBundle(transaction, tip) {
    const bundle = {
      transactions: [],
      tipTransaction: null
    };

    // 添加主交易
    bundle.transactions.push(transaction);

    // 添加 Tip 交易（支付给 Jito 验证者）
    const tipTransaction = await this.createTipTransaction(tip);
    bundle.tipTransaction = tipTransaction;
    bundle.transactions.push(tipTransaction);

    return bundle;
  }

  /**
   * 创建 Tip 交易
   */
  async createTipTransaction(tipLamports) {
    try {
      // Jito 验证者 tip 账户
      const tipAccounts = [
        '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
        '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
        'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
        'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
        'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
        'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
        '9noTFeo2cXsSe9Nj9Qsx2taA68yUf9pjsn1ELo4QVZdG',
        'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
      ];

      // 随机选择一个 tip 账户
      const tipAccount = new PublicKey(
        tipAccounts[Math.floor(Math.random() * tipAccounts.length)]
      );

      // 创建转账交易
      const { Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
      
      const tipTransaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.wallet.publicKey,
          toPubkey: tipAccount,
          lamports: Math.floor(tipLamports * LAMPORTS_PER_SOL)
        })
      );

      tipTransaction.recentBlockhash = (await this.connection.getRecentBlockhash()).blockhash;
      tipTransaction.feePayer = this.wallet.publicKey;

      // 签名
      tipTransaction.sign(this.wallet);

      return tipTransaction;
    } catch (error) {
      console.error('[JitoExecutor] 创建 Tip 交易失败:', error.message);
      throw error;
    }
  }

  /**
   * 发送 Bundle 到 Jito
   */
  async sendBundle(bundle) {
    try {
      // 选择 Block Engine
      const blockEngineUrl = await this.selectBlockEngine();
      
      // 序列化交易
      const serializedTransactions = bundle.transactions.map(tx => {
        if (tx instanceof VersionedTransaction) {
          return bs58.encode(tx.serialize());
        }
        return bs58.encode(tx.serialize());
      });

      // 发送 Bundle
      const response = await axios.post(
        `${blockEngineUrl}/api/v1/bundles`,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'sendBundle',
          params: [serializedTransactions]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(this.authToken ? { 'Authorization': `Bearer ${this.authToken}` } : {})
          },
          timeout: this.config.bundleTimeout
        }
      );

      const bundleId = response.data.result;
      
      console.log(`[JitoExecutor] Bundle 发送成功: ${bundleId}`);

      // 等待 Bundle 确认
      const confirmation = await this.waitForBundleConfirmation(bundleId);
      
      return {
        success: confirmation.confirmed,
        bundleId,
        signature: confirmation.signature,
        error: confirmation.error
      };

    } catch (error) {
      console.error('[JitoExecutor] 发送 Bundle 失败:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 选择最优 Block Engine
   */
  async selectBlockEngine() {
    // 简单轮询策略
    if (!this.currentBlockEngine || !this.config.blockEngineUrls.includes(this.currentBlockEngine)) {
      this.currentBlockEngine = this.config.blockEngineUrls[0];
    } else {
      const currentIndex = this.config.blockEngineUrls.indexOf(this.currentBlockEngine);
      this.currentBlockEngine = this.config.blockEngineUrls[(currentIndex + 1) % this.config.blockEngineUrls.length];
    }

    return this.currentBlockEngine;
  }

  /**
   * 等待 Bundle 确认
   */
  async waitForBundleConfirmation(bundleId, timeout = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const response = await axios.post(
          `${this.currentBlockEngine}/api/v1/bundleStatus`,
          {
            jsonrpc: '2.0',
            id: 1,
            method: 'getBundleStatus',
            params: [bundleId]
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 5000
          }
        );

        const status = response.data.result;
        
        if (status?.status === 'confirmed') {
          return {
            confirmed: true,
            signature: status.transactions?.[0]?.signature,
            slot: status.slot
          };
        }
        
        if (status?.status === 'failed') {
          return {
            confirmed: false,
            error: status.error || 'Bundle 执行失败'
          };
        }

      } catch (error) {
        console.log('[JitoExecutor] 查询 Bundle 状态失败:', error.message);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return {
      confirmed: false,
      error: '等待确认超时'
    };
  }

  /**
   * 动态调整 Tip（基于网络拥堵情况）
   */
  async calculateOptimalTip() {
    try {
      // 获取当前网络拥堵情况
      const priorityFeeData = await this.getPriorityFeeEstimate();
      
      // 基于拥堵程度调整 tip
      const congestionLevel = priorityFeeData.congestionLevel || 'normal';
      
      let tip = this.config.defaultTip;
      
      switch (congestionLevel) {
        case 'very_high':
          tip = this.config.maxTip;
          break;
        case 'high':
          tip = this.config.maxTip * 0.8;
          break;
        case 'medium':
          tip = this.config.defaultTip;
          break;
        case 'low':
          tip = this.config.minTip;
          break;
        default:
          tip = this.config.defaultTip;
      }

      return tip;
    } catch (error) {
      console.error('[JitoExecutor] 计算最优 Tip 失败:', error.message);
      return this.config.defaultTip;
    }
  }

  /**
   * 获取优先费用估算
   */
  async getPriorityFeeEstimate() {
    try {
      const response = await axios.post(
        this.connection.rpcEndpoint,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'getRecentPrioritizationFees',
          params: []
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000
        }
      );

      const fees = response.data.result || [];
      const avgFee = fees.reduce((sum, f) => sum + f.prioritizationFee, 0) / fees.length;

      // 根据平均费用判断拥堵程度
      let congestionLevel = 'low';
      if (avgFee > 100000) congestionLevel = 'very_high';
      else if (avgFee > 50000) congestionLevel = 'high';
      else if (avgFee > 10000) congestionLevel = 'medium';

      return {
        averageFee: avgFee,
        congestionLevel,
        raw: fees
      };
    } catch (error) {
      return {
        averageFee: 0,
        congestionLevel: 'unknown',
        error: error.message
      };
    }
  }

  /**
   * MEV 保护 - 私有交易提交
   */
  async submitPrivateTransaction(transaction) {
    try {
      if (!this.config.mevProtection) {
        return await this.execute(transaction);
      }

      console.log('[JitoExecutor] 使用 MEV 保护提交交易');
      
      // Jito 的 Bundle 本身就是 MEV 保护
      // 交易只发送给验证者，不进入公共 mempool
      return await this.execute(transaction);
      
    } catch (error) {
      console.error('[JitoExecutor] 私有交易提交失败:', error.message);
      throw error;
    }
  }

  /**
   * 批量执行交易
   */
  async executeBatch(transactions, options = {}) {
    const results = [];
    const concurrency = options.concurrency || 1; // Jito 建议串行执行
    
    for (const tx of transactions) {
      try {
        const result = await this.execute(tx, options);
        results.push({ success: true, ...result });
      } catch (error) {
        results.push({ success: false, error: error.message });
        
        // 如果连续失败，停止执行
        const consecutiveFailures = results.filter(r => !r.success).length;
        if (consecutiveFailures >= 3) {
          console.error('[JitoExecutor] 连续失败，停止批量执行');
          break;
        }
      }
    }

    return results;
  }

  /**
   * 更新平均 Tip 统计
   */
  updateAverageTip() {
    const total = this.stats.successfulBundles + this.stats.failedBundles;
    if (total > 0) {
      this.stats.averageTip = this.stats.totalTips / this.stats.successfulBundles;
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const total = this.stats.successfulBundles + this.stats.failedBundles;
    return {
      ...this.stats,
      totalBundles: total,
      successRate: total > 0 ? (this.stats.successfulBundles / total * 100).toFixed(2) + '%' : '0%',
      averageTip: this.stats.averageTip.toFixed(4) + ' SOL'
    };
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.stats = {
      totalBundles: 0,
      successfulBundles: 0,
      failedBundles: 0,
      totalTips: 0,
      averageTip: 0
    };
  }
}

module.exports = JitoExecutor;

// 使用示例
if (require.main === module) {
  const { Keypair } = require('@solana/web3.js');
  
  // 示例：创建执行器
  const wallet = Keypair.generate(); // 实际使用时应加载真实钱包
  const executor = new JitoExecutor({
    wallet,
    defaultTip: 0.002,
    maxRetries: 3
  });

  console.log('Jito Executor 已初始化');
  console.log('统计信息:', executor.getStats());
}
