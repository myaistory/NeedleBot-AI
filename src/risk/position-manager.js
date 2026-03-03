/**
 * Position Manager - 风控仓位管理系统
 * 
 * 功能：
 * 1. 最大仓位控制
 * 2. 自动止损（默认 5%）
 * 3. 自动止盈（默认 25%）
 * 4. 每日交易次数限制
 * 5. 总风险敞口监控
 */

const EventEmitter = require('events');

class PositionManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // 风控配置
    this.config = {
      // 仓位控制
      maxPositionSize: options.maxPositionSize || 10, // 单个代币最大仓位 (SOL)
      maxTotalExposure: options.maxTotalExposure || 50, // 总风险敞口 (SOL)
      maxPositions: options.maxPositions || 5, // 最大持仓数量
      
      // 止损止盈
      stopLossPercent: options.stopLossPercent || 5, // 止损百分比 (%)
      takeProfitPercent: options.takeProfitPercent || 25, // 止盈百分比 (%)
      trailingStopLoss: options.trailingStopLoss !== false, // 启用移动止损
      trailingStopPercent: options.trailingStopPercent || 3, // 移动止损回调 (%)
      
      // 交易限制
      maxDailyTrades: options.maxDailyTrades || 20, // 每日最大交易次数
      maxDailyLoss: options.maxDailyLoss || 10, // 每日最大亏损 (SOL)
      maxDailyProfit: options.maxDailyProfit || 50, // 每日最大盈利目标 (SOL)
      
      // 风险控制
      maxLossPerTrade: options.maxLossPerTrade || 2, // 单笔最大亏损 (SOL)
      riskRewardRatio: options.riskRewardRatio || 3, // 最小风报比
      cooldownPeriod: options.cooldownPeriod || 60000, // 交易冷却期 (ms)
      
      // 紧急控制
      emergencyStop: options.emergencyStop !== false, // 启用紧急停止
      emergencyStopLoss: options.emergencyStopLoss || 20, // 紧急止损线 (%)
    };

    // 当前状态
    this.state = {
      positions: new Map(), // 当前持仓
      dailyStats: {
        date: new Date().toDateString(),
        trades: 0,
        wins: 0,
        losses: 0,
        profit: 0, // SOL
        maxDrawdown: 0
      },
      totalExposure: 0, // 总风险敞口 (SOL)
      lastTradeTime: 0,
      isEmergencyStop: false,
      peakBalance: 0
    };

    // 止损止盈监控
    this.monitoringInterval = null;
    this.startMonitoring();

    console.log('[PositionManager] 初始化完成', {
      maxPositionSize: this.config.maxPositionSize,
      stopLossPercent: this.config.stopLossPercent,
      takeProfitPercent: this.config.takeProfitPercent,
      maxDailyTrades: this.config.maxDailyTrades
    });
  }

  /**
   * 检查是否可以开仓
   * @param {Object} tradePlan - 交易计划
   * @returns {Promise<Object>} 检查结果
   */
  async canOpenPosition(tradePlan) {
    const result = {
      allowed: true,
      reason: null,
      riskLevel: 'LOW'
    };

    // 1. 紧急停止检查
    if (this.state.isEmergencyStop) {
      return {
        allowed: false,
        reason: '紧急停止已触发',
        riskLevel: 'CRITICAL'
      };
    }

    // 2. 每日交易次数限制
    if (this.state.dailyStats.trades >= this.config.maxDailyTrades) {
      return {
        allowed: false,
        reason: `达到每日交易次数限制 (${this.config.maxDailyTrades})`,
        riskLevel: 'HIGH'
      };
    }

    // 3. 每日亏损限制
    if (this.state.dailyStats.profit <= -this.config.maxDailyLoss) {
      return {
        allowed: false,
        reason: `达到每日最大亏损限制 (${this.config.maxDailyLoss} SOL)`,
        riskLevel: 'HIGH'
      };
    }

    // 4. 总风险敞口检查
    const proposedExposure = this.state.totalExposure + tradePlan.size;
    if (proposedExposure > this.config.maxTotalExposure) {
      return {
        allowed: false,
        reason: `超过总风险敞口限制 (${this.config.maxTotalExposure} SOL)`,
        riskLevel: 'HIGH'
      };
    }

    // 5. 单笔仓位限制
    if (tradePlan.size > this.config.maxPositionSize) {
      return {
        allowed: false,
        reason: `超过单笔最大仓位限制 (${this.config.maxPositionSize} SOL)`,
        riskLevel: 'MEDIUM'
      };
    }

    // 6. 最大持仓数量限制
    if (this.state.positions.size >= this.config.maxPositions) {
      return {
        allowed: false,
        reason: `达到最大持仓数量限制 (${this.config.maxPositions})`,
        riskLevel: 'MEDIUM'
      };
    }

    // 7. 交易冷却期检查
    const now = Date.now();
    if (now - this.state.lastTradeTime < this.config.cooldownPeriod) {
      return {
        allowed: false,
        reason: `交易冷却期 (${this.config.cooldownPeriod / 1000}秒)`,
        riskLevel: 'LOW'
      };
    }

    // 8. 风报比检查
    if (tradePlan.expectedProfit && tradePlan.potentialLoss) {
      const riskReward = tradePlan.expectedProfit / tradePlan.potentialLoss;
      if (riskReward < this.config.riskRewardRatio) {
        return {
          allowed: false,
          reason: `风报比不足 (${riskReward.toFixed(2)} < ${this.config.riskRewardRatio})`,
          riskLevel: 'MEDIUM'
        };
      }
    }

    // 9. 检查是否已有该代币持仓
    if (this.state.positions.has(tradePlan.tokenAddress)) {
      return {
        allowed: false,
        reason: '已持有该代币仓位',
        riskLevel: 'LOW'
      };
    }

    return result;
  }

  /**
   * 开仓
   * @param {Object} position - 仓位信息
   * @returns {Promise<Object>} 开仓结果
   */
  async openPosition(position) {
    const checkResult = await this.canOpenPosition({
      tokenAddress: position.tokenAddress,
      size: position.size,
      expectedProfit: position.takeProfitAmount,
      potentialLoss: position.stopLossAmount
    });

    if (!checkResult.allowed) {
      this.emit('positionRejected', { position, reason: checkResult.reason });
      return {
        success: false,
        error: checkResult.reason
      };
    }

    // 创建仓位
    const newPosition = {
      id: `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tokenAddress: position.tokenAddress,
      size: position.size,
      entryPrice: position.entryPrice,
      entryTime: Date.now(),
      stopLoss: {
        price: position.entryPrice * (1 - this.config.stopLossPercent / 100),
        percent: this.config.stopLossPercent,
        amount: position.size * (this.config.stopLossPercent / 100)
      },
      takeProfit: {
        price: position.entryPrice * (1 + this.config.takeProfitPercent / 100),
        percent: this.config.takeProfitPercent,
        amount: position.size * (this.config.takeProfitPercent / 100)
      },
      currentPrice: position.entryPrice,
      currentValue: position.size,
      unrealizedPnL: 0,
      unrealizedPnLPercent: 0,
      peakPrice: position.entryPrice,
      status: 'OPEN'
    };

    // 保存仓位
    this.state.positions.set(position.tokenAddress, newPosition);
    this.state.totalExposure += position.size;
    this.state.lastTradeTime = Date.now();
    this.state.dailyStats.trades++;

    this.emit('positionOpened', newPosition);
    console.log(`[PositionManager] 开仓：${position.tokenAddress}`, {
      size: position.size,
      entryPrice: position.entryPrice
    });

    return {
      success: true,
      position: newPosition
    };
  }

  /**
   * 更新仓位价格
   * @param {string} tokenAddress - 代币地址
   * @param {number} currentPrice - 当前价格
   */
  updatePositionPrice(tokenAddress, currentPrice) {
    const position = this.state.positions.get(tokenAddress);
    if (!position) return;

    const oldValue = position.currentValue;
    position.currentPrice = currentPrice;
    position.currentValue = position.size * (currentPrice / position.entryPrice);
    position.unrealizedPnL = position.currentValue - position.size;
    position.unrealizedPnLPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;

    // 更新最高价（用于移动止损）
    if (currentPrice > position.peakPrice) {
      position.peakPrice = currentPrice;
      
      // 更新移动止损
      if (this.config.trailingStopLoss) {
        const trailingStopPrice = position.peakPrice * (1 - this.config.trailingStopPercent / 100);
        if (trailingStopPrice > position.stopLoss.price) {
          position.stopLoss.price = trailingStopPrice;
          this.emit('stopLossUpdated', { position, newStopLoss: trailingStopPrice });
        }
      }
    }

    // 检查止损止盈
    this.checkStopLossTakeProfit(position);
  }

  /**
   * 检查止损止盈
   */
  checkStopLossTakeProfit(position) {
    // 止损检查
    if (position.currentPrice <= position.stopLoss.price) {
      this.emit('stopLossTriggered', {
        position,
        triggerPrice: position.currentPrice,
        lossAmount: Math.abs(position.unrealizedPnL)
      });
      console.log(`[PositionManager] 止损触发：${position.tokenAddress}`, {
        triggerPrice: position.currentPrice,
        lossAmount: position.unrealizedPnL
      });
    }

    // 止盈检查
    if (position.currentPrice >= position.takeProfit.price) {
      this.emit('takeProfitTriggered', {
        position,
        triggerPrice: position.currentPrice,
        profitAmount: position.unrealizedPnL
      });
      console.log(`[PositionManager] 止盈触发：${position.tokenAddress}`, {
        triggerPrice: position.currentPrice,
        profitAmount: position.unrealizedPnL
      });
    }

    // 紧急止损检查
    if (this.config.emergencyStop && 
        position.unrealizedPnLPercent <= -this.config.emergencyStopLoss) {
      this.emit('emergencyStopTriggered', {
        position,
        lossPercent: position.unrealizedPnLPercent
      });
      console.log(`[PositionManager] 紧急止损触发：${position.tokenAddress}`, {
        lossPercent: position.unrealizedPnLPercent
      });
    }
  }

  /**
   * 平仓
   * @param {string} tokenAddress - 代币地址
   * @param {Object} options - 平仓选项
   * @returns {Object} 平仓结果
   */
  closePosition(tokenAddress, options = {}) {
    const position = this.state.positions.get(tokenAddress);
    if (!position) {
      return {
        success: false,
        error: '仓位不存在'
      };
    }

    const closePrice = options.price || position.currentPrice;
    const closeValue = position.size * (closePrice / position.entryPrice);
    const pnl = closeValue - position.size;
    const pnlPercent = ((closePrice - position.entryPrice) / position.entryPrice) * 100;

    // 更新持仓状态
    position.status = 'CLOSED';
    position.closePrice = closePrice;
    position.closeTime = Date.now();
    position.realizedPnL = pnl;
    position.realizedPnLPercent = pnlPercent;
    position.closeReason = options.reason || 'MANUAL';

    // 更新每日统计
    this.state.dailyStats.profit += pnl;
    if (pnl > 0) {
      this.state.dailyStats.wins++;
    } else {
      this.state.dailyStats.losses++;
    }

    // 更新总风险敞口
    this.state.totalExposure -= position.size;

    // 更新最大回撤
    if (pnl < 0) {
      const drawdown = Math.abs(pnl);
      if (drawdown > this.state.dailyStats.maxDrawdown) {
        this.state.dailyStats.maxDrawdown = drawdown;
      }
    }

    // 从持仓中移除
    this.state.positions.delete(tokenAddress);

    this.emit('positionClosed', {
      position,
      pnl,
      pnlPercent,
      reason: options.reason
    });

    console.log(`[PositionManager] 平仓：${tokenAddress}`, {
      closePrice,
      pnl: pnl.toFixed(4),
      pnlPercent: pnlPercent.toFixed(2) + '%',
      reason: options.reason
    });

    return {
      success: true,
      position,
      pnl,
      pnlPercent
    };
  }

  /**
   * 批量平仓（紧急情况下使用）
   */
  closeAllPositions(reason = 'EMERGENCY') {
    const results = [];
    
    for (const [tokenAddress, position] of this.state.positions) {
      const result = this.closePosition(tokenAddress, { reason });
      results.push(result);
    }

    this.emit('allPositionsClosed', { reason, count: results.length });
    console.log(`[PositionManager] 批量平仓：${results.length} 个仓位`, reason);

    return results;
  }

  /**
   * 启动监控
   */
  startMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    // 每秒检查一次止损止盈
    this.monitoringInterval = setInterval(() => {
      this.checkDailyLimits();
    }, 1000);

    console.log('[PositionManager] 监控已启动');
  }

  /**
   * 检查每日限制
   */
  checkDailyLimits() {
    // 检查是否需要重置每日统计
    const today = new Date().toDateString();
    if (today !== this.state.dailyStats.date) {
      this.resetDailyStats();
    }

    // 检查是否达到每日盈利目标
    if (this.state.dailyStats.profit >= this.config.maxDailyProfit) {
      console.log('[PositionManager] 达到每日盈利目标，建议停止交易');
      this.emit('dailyProfitTargetReached', this.state.dailyStats);
    }
  }

  /**
   * 重置每日统计
   */
  resetDailyStats() {
    const oldStats = { ...this.state.dailyStats };
    
    this.state.dailyStats = {
      date: new Date().toDateString(),
      trades: 0,
      wins: 0,
      losses: 0,
      profit: 0,
      maxDrawdown: 0
    };

    this.emit('dailyStatsReset', { oldStats, newStats: this.state.dailyStats });
    console.log('[PositionManager] 每日统计已重置');
  }

  /**
   * 触发紧急停止
   */
  triggerEmergencyStop(reason) {
    this.state.isEmergencyStop = true;
    
    // 平掉所有仓位
    this.closeAllPositions('EMERGENCY_STOP');

    this.emit('emergencyStopTriggered', { reason, timestamp: new Date().toISOString() });
    console.error('[PositionManager] 紧急停止已触发:', reason);
  }

  /**
   * 恢复交易
   */
  resumeTrading() {
    this.state.isEmergencyStop = false;
    this.emit('tradingResumed');
    console.log('[PositionManager] 交易已恢复');
  }

  /**
   * 获取当前持仓
   */
  getPositions() {
    return Array.from(this.state.positions.values());
  }

  /**
   * 获取特定持仓
   */
  getPosition(tokenAddress) {
    return this.state.positions.get(tokenAddress);
  }

  /**
   * 获取风险敞口
   */
  getExposure() {
    return {
      totalExposure: this.state.totalExposure,
      maxExposure: this.config.maxTotalExposure,
      availableExposure: this.config.maxTotalExposure - this.state.totalExposure,
      positionCount: this.state.positions.size,
      maxPositions: this.config.maxPositions
    };
  }

  /**
   * 获取每日统计
   */
  getDailyStats() {
    return {
      ...this.state.dailyStats,
      winRate: this.state.dailyStats.trades > 0 
        ? ((this.state.dailyStats.wins / this.state.dailyStats.trades) * 100).toFixed(2) + '%'
        : '0%',
      isEmergencyStop: this.state.isEmergencyStop,
      lastTradeTime: this.state.lastTradeTime ? new Date(this.state.lastTradeTime).toISOString() : null
    };
  }

  /**
   * 获取完整状态
   */
  getState() {
    return {
      positions: this.getPositions(),
      exposure: this.getExposure(),
      dailyStats: this.getDailyStats(),
      config: this.config
    };
  }

  /**
   * 停止监控
   */
  stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    console.log('[PositionManager] 监控已停止');
  }
}

module.exports = PositionManager;

// 使用示例
if (require.main === module) {
  const manager = new PositionManager({
    maxPositionSize: 5,
    stopLossPercent: 5,
    takeProfitPercent: 25,
    maxDailyTrades: 10
  });

  // 监听事件
  manager.on('positionOpened', (position) => {
    console.log('新开仓位:', position.id);
  });

  manager.on('stopLossTriggered', (data) => {
    console.log('止损触发:', data.position.tokenAddress);
  });

  manager.on('takeProfitTriggered', (data) => {
    console.log('止盈触发:', data.position.tokenAddress);
  });

  console.log('PositionManager 已初始化');
  console.log('当前状态:', manager.getState());
}
