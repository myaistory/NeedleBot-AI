const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

class PaperTrading {
    constructor(config = {}) {
        this.config = {
            initialBalanceSOL: config.initialBalanceSOL || 1.0,
            tradeFeePercent: config.tradeFeePercent || 0.5,
            slippagePercent: config.slippagePercent || 2.0,
            dataDir: config.dataDir || './data',
            ...config
        };
        
        this.balance = {
            sol: this.config.initialBalanceSOL,
            usd: 0,
            tokens: {} // { tokenAddress: { amount, avgPrice } }
        };
        
        this.trades = [];
        this.positions = [];
        this.tradeHistory = [];
        
        this.stats = {
            totalTrades: 0,
            winningTrades: 0,
            losingTrades: 0,
            totalProfitSOL: 0,
            totalProfitUSD: 0,
            maxDrawdownSOL: 0,
            maxDrawdownUSD: 0,
            sharpeRatio: 0,
            profitFactor: 0
        };
        
        this.initializeDataDir();
    }

    /**
     * 初始化数据目录
     */
    async initializeDataDir() {
        try {
            await fs.mkdir(this.config.dataDir, { recursive: true });
            await fs.mkdir(path.join(this.config.dataDir, 'trades'), { recursive: true });
            await fs.mkdir(path.join(this.config.dataDir, 'positions'), { recursive: true });
            
            // 加载历史数据
            await this.loadHistoricalData();
            
            logger.info(`模拟交易系统初始化完成，初始余额: ${this.balance.sol} SOL`);
        } catch (error) {
            logger.error('初始化数据目录失败:', error);
        }
    }

    /**
     * 执行模拟交易
     */
    async executeTrade(signal, tokenInfo, amountSOL, currentPrice) {
        const tradeId = `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
            // 1. 验证交易条件
            const validation = this.validateTrade(amountSOL, currentPrice);
            if (!validation.valid) {
                return {
                    success: false,
                    tradeId,
                    reason: validation.reason,
                    timestamp: Date.now()
                };
            }

            // 2. 计算交易参数
            const tradeParams = this.calculateTradeParams(amountSOL, currentPrice);
            
            // 3. 记录开仓
            const position = this.openPosition(tradeId, signal, tokenInfo, tradeParams);
            
            // 4. 更新余额
            this.updateBalance(tradeParams);
            
            // 5. 保存交易记录
            await this.saveTradeRecord(position);
            
            // 6. 更新统计
            this.updateStats(position);
            
            logger.info(`模拟交易执行成功: ${tradeId}, 买入 ${tokenInfo.symbol}, 数量: ${position.tokenAmount}`);
            
            return {
                success: true,
                tradeId,
                position,
                timestamp: Date.now()
            };
            
        } catch (error) {
            logger.error(`模拟交易执行失败 ${tradeId}:`, error);
            return {
                success: false,
                tradeId,
                reason: error.message,
                timestamp: Date.now()
            };
        }
    }

    /**
     * 验证交易条件
     */
    validateTrade(amountSOL, currentPrice) {
        // 1. 余额检查
        if (amountSOL > this.balance.sol) {
            return { valid: false, reason: '余额不足' };
        }
        
        // 2. 最小交易量检查
        if (amountSOL < 0.01) {
            return { valid: false, reason: '交易量太小' };
        }
        
        // 3. 价格有效性检查
        if (!currentPrice || currentPrice <= 0) {
            return { valid: false, reason: '价格无效' };
        }
        
        return { valid: true };
    }

    /**
     * 计算交易参数
     */
    calculateTradeParams(amountSOL, currentPrice) {
        // 计算手续费
        const feeSOL = amountSOL * (this.config.tradeFeePercent / 100);
        
        // 计算滑点影响
        const slippageMultiplier = 1 + (this.config.slippagePercent / 100);
        const effectivePrice = currentPrice * slippageMultiplier;
        
        // 实际可用的SOL数量
        const netAmountSOL = amountSOL - feeSOL;
        
        // 计算可购买的代币数量
        const tokenAmount = netAmountSOL / effectivePrice;
        
        return {
            amountSOL,
            feeSOL,
            slippagePercent: this.config.slippagePercent,
            currentPrice,
            effectivePrice,
            netAmountSOL,
            tokenAmount
        };
    }

    /**
     * 开仓
     */
    openPosition(tradeId, signal, tokenInfo, tradeParams) {
        const position = {
            tradeId,
            tokenAddress: tokenInfo.address,
            tokenSymbol: tokenInfo.symbol,
            tokenName: tokenInfo.name,
            openTime: Date.now(),
            closeTime: null,
            openPrice: tradeParams.effectivePrice,
            closePrice: null,
            tokenAmount: tradeParams.tokenAmount,
            investedSOL: tradeParams.amountSOL,
            feeSOL: tradeParams.feeSOL,
            signal: {
                confidence: signal.confidence,
                dropPercentage: signal.analysis?.dropPercentage || 0,
                recoveryEstimate: signal.analysis?.recoveryEstimate || 0
            },
            status: 'open',
            profitLossSOL: 0,
            profitLossPercent: 0,
            exitReason: null
        };
        
        // 添加到持仓列表
        this.positions.push(position);
        
        // 更新代币持仓
        if (!this.balance.tokens[tokenInfo.address]) {
            this.balance.tokens[tokenInfo.address] = {
                amount: 0,
                avgPrice: 0,
                totalInvested: 0
            };
        }
        
        const tokenBalance = this.balance.tokens[tokenInfo.address];
        const totalAmount = tokenBalance.amount + position.tokenAmount;
        const totalValue = (tokenBalance.avgPrice * tokenBalance.amount) + 
                          (position.openPrice * position.tokenAmount);
        
        tokenBalance.amount = totalAmount;
        tokenBalance.avgPrice = totalValue / totalAmount;
        tokenBalance.totalInvested += position.investedSOL;
        
        return position;
    }

    /**
     * 更新余额
     */
    updateBalance(tradeParams) {
        this.balance.sol -= tradeParams.amountSOL;
        
        // 记录手续费支出
        this.tradeHistory.push({
            type: 'fee',
            amount: -tradeParams.feeSOL,
            timestamp: Date.now(),
            description: '交易手续费'
        });
        
        // 记录交易支出
        this.tradeHistory.push({
            type: 'trade',
            amount: -tradeParams.netAmountSOL,
            timestamp: Date.now(),
            description: '代币购买'
        });
    }

    /**
     * 平仓
     */
    async closePosition(tradeId, closePrice, exitReason = 'manual') {
        const positionIndex = this.positions.findIndex(p => p.tradeId === tradeId && p.status === 'open');
        
        if (positionIndex === -1) {
            throw new Error(`未找到持仓: ${tradeId}`);
        }
        
        const position = this.positions[positionIndex];
        
        // 计算盈亏
        const currentValue = position.tokenAmount * closePrice;
        const investedValue = position.tokenAmount * position.openPrice;
        const profitLossSOL = currentValue - investedValue;
        const profitLossPercent = (profitLossSOL / investedValue) * 100;
        
        // 计算手续费
        const feeSOL = currentValue * (this.config.tradeFeePercent / 100);
        
        // 更新持仓状态
        position.closeTime = Date.now();
        position.closePrice = closePrice;
        position.status = 'closed';
        position.profitLossSOL = profitLossSOL - feeSOL;
        position.profitLossPercent = profitLossPercent;
        position.exitReason = exitReason;
        position.feeSOL += feeSOL;
        
        // 更新余额
        const netProceeds = currentValue - feeSOL;
        this.balance.sol += netProceeds;
        
        // 更新代币持仓
        const tokenBalance = this.balance.tokens[position.tokenAddress];
        if (tokenBalance) {
            tokenBalance.amount -= position.tokenAmount;
            if (tokenBalance.amount <= 0) {
                delete this.balance.tokens[position.tokenAddress];
            }
        }
        
        // 记录交易历史
        this.tradeHistory.push({
            type: 'close',
            amount: netProceeds,
            profitLoss: profitLossSOL,
            timestamp: Date.now(),
            description: `平仓 ${position.tokenSymbol}`
        });
        
        // 保存交易记录
        await this.saveTradeRecord(position);
        
        // 更新统计
        this.updateStats(position);
        
        logger.info(`平仓成功: ${tradeId}, ${position.tokenSymbol}, 盈亏: ${position.profitLossSOL.toFixed(4)} SOL (${position.profitLossPercent.toFixed(2)}%)`);
        
        return position;
    }

    /**
     * 自动止盈止损
     */
    async checkAutoClose(position, currentPrice) {
        if (position.status !== 'open') return null;
        
        const currentValue = position.tokenAmount * currentPrice;
        const investedValue = position.tokenAmount * position.openPrice;
        const profitLossPercent = ((currentValue - investedValue) / investedValue) * 100;
        
        // 止盈检查
        if (profitLossPercent >= 25) {
            return await this.closePosition(
                position.tradeId, 
                currentPrice, 
                `自动止盈: +${profitLossPercent.toFixed(2)}%`
            );
        }
        
        // 止损检查
        if (profitLossPercent <= -5) {
            return await this.closePosition(
                position.tradeId, 
                currentPrice, 
                `自动止损: ${profitLossPercent.toFixed(2)}%`
            );
        }
        
        return null;
    }

    /**
     * 更新统计信息
     */
    updateStats(position) {
        if (position.status !== 'closed') return;
        
        this.stats.totalTrades++;
        
        if (position.profitLossSOL > 0) {
            this.stats.winningTrades++;
        } else {
            this.stats.losingTrades++;
        }
        
        this.stats.totalProfitSOL += position.profitLossSOL;
        
        // 更新最大回撤
        this.updateDrawdown();
        
        // 更新夏普比率和盈利因子
        this.updateAdvancedStats();
    }

    /**
     * 更新最大回撤
     */
    updateDrawdown() {
        // 简化实现：跟踪余额变化
        const peakBalance = Math.max(...this.tradeHistory
            .filter(t => t.type === 'close' && t.amount > 0)
            .map(t => t.amount));
        
        const currentBalance = this.balance.sol;
        const drawdown = peakBalance > 0 ? 
            ((peakBalance - currentBalance) / peakBalance) * 100 : 0;
        
        this.stats.maxDrawdownSOL = Math.max(this.stats.maxDrawdownSOL, drawdown);
    }

    /**
     * 更新高级统计
     */
    updateAdvancedStats() {
        if (this.stats.totalTrades < 5) return;
        
        // 计算夏普比率（简化版）
        const returns = this.tradeHistory
            .filter(t => t.type === 'close')
            .map(t => t.profitLoss || 0);
        
        if (returns.length > 0) {
            const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
            const stdDev = Math.sqrt(
                returns.map(r => Math.pow(r - avgReturn, 2))
                       .reduce((a, b) => a + b, 0) / returns.length
            );
            
            this.stats.sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;
        }
        
        // 计算盈利因子
        const totalProfit = this.tradeHistory
            .filter(t => t.type === 'close' && (t.profitLoss || 0) > 0)
            .reduce((a, b) => a + (b.profitLoss || 0), 0);
        
        const totalLoss = Math.abs(this.tradeHistory
            .filter(t => t.type === 'close' && (t.profitLoss || 0) < 0)
            .reduce((a, b) => a + (b.profitLoss || 0), 0));
        
        this.stats.profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit;
    }

    /**
     * 保存交易记录
     */
    async saveTradeRecord(position) {
        try {
            const filename = `trade_${position.tradeId}.json`;
            const filepath = path.join(this.config.dataDir, 'trades', filename);
            
            await fs.writeFile(
                filepath, 
                JSON.stringify(position, null, 2),
                'utf8'
            );
            
            // 同时添加到交易列表
            this.trades.push(position);
            
        } catch (error) {
            logger.error('保存交易记录失败:', error);
        }
    }

    /**
     * 加载历史数据
     */
    async loadHistoricalData() {
        try {
            const tradesDir = path.join(this.config.dataDir, 'trades');
            const files = await fs.readdir(tradesDir);
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const content = await fs.readFile(
                        path.join(tradesDir, file), 
                        'utf8'
                    );
                    const trade = JSON.parse(content);
                    this.trades.push(trade);
                    
                    if (trade.status === 'open') {
                        this.positions.push(trade);
                    }
                }
            }
            
            logger.info(`加载了 ${this.trades.length} 条历史交易记录`);
        } catch (error) {
            // 目录可能不存在，这是正常的
            logger.debug('无历史交易数据可加载');
        }
    }

    /**
     * 生成报告
     */
    generateReport() {
        const winRate = this.stats.totalTrades > 0 ? 
            (this.stats.winningTrades / this.stats.totalTrades) * 100 : 0;
        
        const avgProfit = this.stats.totalTrades > 0 ? 
            this.stats.totalProfitSOL / this.stats.totalTrades : 0;
        
        return {
            balance: this.balance,
            stats: {
                ...this.stats,
                winRate: winRate.toFixed(2),
                avgProfit: avgProfit.toFixed(4),
                totalPositions: this.positions.length,
                openPositions: this.positions.filter(p => p.status === 'open').length
            },
            recentTrades: this.trades.slice(-10),
            openPositions: this.positions.filter(p => p.status === 'open'),
            timestamp: Date.now()
        };
    }

    /**
     * 重置模拟账户
     */
    resetAccount() {
        this.balance = {
            sol: this.config.initialBalanceSOL,
            usd: 0,
            tokens: {}
        };
        
        this.trades = [];
        this.positions = [];
        this.tradeHistory = [];
        
        this.stats = {
            totalTrades: 0,
            winningTrades: 0,
            losingTrades: 0,
            totalProfitSOL: 0,
            totalProfitUSD: 0,
            maxDrawdownSOL: 0,
            maxDrawdownUSD: 0,
            sharpeRatio: 0,
            profitFactor: 0
        };
        
        logger.info('模拟账户已重置');
    }
}

module.exports = PaperTrading;