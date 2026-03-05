/**
 * NeedleBot AI 回测引擎
 * 提供历史数据回测功能，验证交易策略有效性
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const PriceFetcher = require('../core/price-fetcher');
const NeedleDetector = require('../strategy/needle-detector');
const RiskManager = require('../risk/risk-manager');
const PaperTrading = require('../simulation/paper-trading');

class BacktestEngine {
    constructor(config = {}) {
        this.config = {
            initialBalance: 1000, // 初始资金
            startDate: '2024-01-01',
            endDate: '2024-12-31',
            timeFrame: '1h', // 时间框架: 1m, 5m, 15m, 1h, 4h, 1d
            commissionRate: 0.001, // 交易手续费率
            slippage: 0.002, // 滑点
            ...config
        };

        this.priceFetcher = new PriceFetcher();
        this.needleDetector = new NeedleDetector();
        this.riskManager = new RiskManager();
        this.paperTrading = new PaperTrading({ initialBalanceSOL: this.config.initialBalance });
        
        // 简化的余额跟踪（用于回测）
        this.backtestBalance = this.config.initialBalance;

        this.results = {
            trades: [],
            metrics: {},
            charts: {}
        };
    }

    /**
     * 运行回测
     */
    async runBacktest(symbol = 'SOL') {
        logger.info(`开始回测 ${symbol}，时间范围: ${this.config.startDate} 到 ${this.config.endDate}`);
        
        try {
            // 1. 获取历史数据
            const historicalData = await this.fetchHistoricalData(symbol);
            if (historicalData.length === 0) {
                throw new Error(`无法获取 ${symbol} 的历史数据`);
            }

            logger.info(`获取到 ${historicalData.length} 条历史数据`);

            // 2. 运行回测
            await this.executeBacktest(historicalData, symbol);

            // 3. 计算指标
            await this.calculateMetrics();

            // 4. 生成报告
            const report = await this.generateReport();

            logger.info(`回测完成，总交易次数: ${this.results.trades.length}`);
            logger.info(`最终余额: $${this.paperTrading.getBalance().toFixed(2)}`);
            logger.info(`总收益率: ${report.metrics.totalReturn.toFixed(2)}%`);

            return report;

        } catch (error) {
            logger.error('回测失败:', error.message);
            throw error;
        }
    }

    /**
     * 获取历史数据
     */
    async fetchHistoricalData(symbol) {
        logger.info(`获取 ${symbol} 历史数据...`);
        
        // 这里应该调用历史数据API
        // 暂时使用模拟数据
        return this.generateMockHistoricalData(symbol);
    }

    /**
     * 生成模拟历史数据
     */
    generateMockHistoricalData(symbol) {
        const data = [];
        const startPrice = 80; // 起始价格
        const volatility = 0.02; // 波动率
        
        let currentPrice = startPrice;
        const startTime = new Date(this.config.startDate).getTime();
        const endTime = new Date(this.config.endDate).getTime();
        
        // 根据时间框架确定数据点数量
        const timeFrameMs = this.getTimeFrameMs(this.config.timeFrame);
        const numPoints = Math.floor((endTime - startTime) / timeFrameMs);
        
        for (let i = 0; i < numPoints; i++) {
            // 随机价格变动
            const change = (Math.random() - 0.5) * 2 * volatility * currentPrice;
            currentPrice = Math.max(0.01, currentPrice + change);
            
            // 模拟插针（偶尔的大幅下跌）
            if (Math.random() < 0.01) { // 1%的概率出现插针
                const drop = currentPrice * (0.2 + Math.random() * 0.3); // 20-50%的下跌
                currentPrice = Math.max(0.01, currentPrice - drop);
            }
            
            const timestamp = startTime + i * timeFrameMs;
            
            data.push({
                timestamp,
                date: new Date(timestamp).toISOString(),
                open: currentPrice * (1 - Math.random() * 0.01),
                high: currentPrice * (1 + Math.random() * 0.02),
                low: currentPrice * (1 - Math.random() * 0.03),
                close: currentPrice,
                volume: Math.random() * 1000000 + 100000
            });
        }
        
        return data;
    }

    /**
     * 执行回测
     */
    async executeBacktest(historicalData, symbol) {
        logger.info('执行回测...');
        
        let position = null;
        let entryPrice = 0;
        
        for (let i = 0; i < historicalData.length; i++) {
            const currentData = historicalData[i];
            const price = currentData.close;
            
            // 检查是否有持仓
            if (position) {
                // 检查是否需要平仓
                const shouldClose = this.checkExitCondition(position, entryPrice, price, i);
                
                if (shouldClose) {
                    // 执行平仓
                    const exitResult = this.executeExit(position, entryPrice, price, currentData.timestamp);
                    
                    this.results.trades.push(exitResult);
                    position = null;
                    entryPrice = 0;
                }
            } else {
                // 检查是否有买入信号
                const signal = this.needleDetector.detectNeedleSignal(currentData, historicalData.slice(Math.max(0, i - 20), i));
                
                if (signal && signal.action === 'BUY') {
                    // 执行买入
                    const entryResult = this.executeEntry(symbol, price, currentData.timestamp, signal);
                    
                    if (entryResult.success) {
                        position = 'LONG';
                        entryPrice = price;
                        this.results.trades.push(entryResult);
                    }
                }
            }
            
            // 每1000个数据点记录一次进度
            if (i % 1000 === 0 && i > 0) {
                logger.info(`回测进度: ${((i / historicalData.length) * 100).toFixed(1)}%`);
            }
        }
        
        // 如果最后还有持仓，强制平仓
        if (position) {
            const lastPrice = historicalData[historicalData.length - 1].close;
            const exitResult = this.executeExit(position, entryPrice, lastPrice, historicalData[historicalData.length - 1].timestamp);
            this.results.trades.push(exitResult);
        }
    }

    /**
     * 执行买入
     */
    executeEntry(symbol, price, timestamp, signal) {
        const positionSize = this.riskManager.calculatePositionSize(
            this.paperTrading.getBalance(),
            price,
            signal.confidence
        );
        
        if (positionSize <= 0) {
            return { success: false, reason: '仓位大小为零' };
        }
        
        // 考虑滑点和手续费
        const entryPrice = price * (1 + this.config.slippage);
        const cost = entryPrice * positionSize;
        const commission = cost * this.config.commissionRate;
        const totalCost = cost + commission;
        
        // 检查资金是否足够
        if (totalCost > this.backtestBalance) {
            return { success: false, reason: '资金不足' };
        }
        
        // 执行交易 - 简化处理，直接扣减余额
        this.backtestBalance -= totalCost;
        
        const trade = {
            id: `trade_${Date.now()}`,
            symbol,
            action: 'BUY',
            price: entryPrice,
            amount: positionSize,
            timestamp,
            reason: signal.reason,
            confidence: signal.confidence
        };
        
        return {
            success: true,
            type: 'ENTRY',
            symbol,
            action: 'BUY',
            price: entryPrice,
            amount: positionSize,
            cost: totalCost,
            timestamp,
            balance: this.paperTrading.getBalance(),
            tradeId: trade.id
        };
    }

    /**
     * 执行卖出
     */
    executeExit(position, entryPrice, exitPrice, timestamp, amount = 0.1) {
        // 简化处理：使用传入的 amount
        if (amount <= 0) {
            return { success: false, reason: '没有持仓' };
        }
        
        // 考虑滑点和手续费
        const adjustedExitPrice = exitPrice * (1 - this.config.slippage);
        const revenue = adjustedExitPrice * amount;
        const commission = revenue * this.config.commissionRate;
        const netRevenue = revenue - commission;
        
        // 执行平仓 - 简化处理，直接增加余额
        this.backtestBalance += netRevenue;
        
        const profit = netRevenue - (entryPrice * amount);
        const profitPercent = (profit / (entryPrice * amount)) * 100;
        
        const trade = {
            id: `trade_${Date.now()}`,
            symbol: 'SOL',
            action: 'SELL',
            timestamp,
            reason: 'Exit position'
        };
        
        return {
            success: true,
            type: 'EXIT',
            symbol: 'SOL',
            action: 'SELL',
            entryPrice,
            exitPrice: adjustedExitPrice,
            amount,
            profit,
            profitPercent,
            timestamp,
            balance: this.backtestBalance,
            tradeId: trade.id
        };
    }

    /**
     * 检查退出条件
     */
    checkExitCondition(position, entryPrice, currentPrice, index) {
        // 1. 止盈条件 (20% profit)
        const profit = (currentPrice - entryPrice) / entryPrice;
        if (profit >= 0.20) {
            return true;
        }
        
        // 2. 止损条件 (10% loss)
        if (profit <= -0.10) {
            return true;
        }
        
        // 3. 时间止损 (持有超过24小时)
        // 这里需要根据时间框架调整
        const holdTime = index; // 简化处理
        if (holdTime > 24) {
            return true;
        }
        
        return false;
    }

    /**
     * 计算回测指标
     */
    async calculateMetrics() {
        const trades = this.results.trades.filter(t => t.success);
        
        if (trades.length === 0) {
            this.results.metrics = {
                totalTrades: 0,
                winningTrades: 0,
                losingTrades: 0,
                winRate: 0,
                totalReturn: 0,
                maxDrawdown: 0,
                sharpeRatio: 0,
                profitFactor: 0
            };
            return;
        }
        
        // 计算基本指标
        const winningTrades = trades.filter(t => t.profit > 0);
        const losingTrades = trades.filter(t => t.profit <= 0);
        
        const totalProfit = winningTrades.reduce((sum, t) => sum + t.profit, 0);
        const totalLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0));
        
        // 计算资金曲线
        const equityCurve = this.calculateEquityCurve(trades);
        
        // 计算最大回撤
        const maxDrawdown = this.calculateMaxDrawdown(equityCurve);
        
        // 计算夏普比率（简化版）
        const sharpeRatio = this.calculateSharpeRatio(trades);
        
        this.results.metrics = {
            totalTrades: trades.length,
            winningTrades: winningTrades.length,
            losingTrades: losingTrades.length,
            winRate: (winningTrades.length / trades.length) * 100,
            totalReturn: ((this.backtestBalance - this.config.initialBalance) / this.config.initialBalance) * 100,
            totalProfit,
            totalLoss,
            profitFactor: totalLoss > 0 ? totalProfit / totalLoss : totalProfit,
            maxDrawdown: maxDrawdown * 100, // 转换为百分比
            sharpeRatio,
            avgProfit: winningTrades.length > 0 ? totalProfit / winningTrades.length : 0,
            avgLoss: losingTrades.length > 0 ? totalLoss / losingTrades.length : 0,
            profitLossRatio: losingTrades.length > 0 ? 
                (totalProfit / winningTrades.length) / (totalLoss / losingTrades.length) : 
                totalProfit / winningTrades.length
        };
    }

    /**
     * 计算资金曲线
     */
    calculateEquityCurve(trades) {
        let balance = this.config.initialBalance;
        const equityCurve = [balance];
        
        for (const trade of trades) {
            if (trade.type === 'ENTRY') {
                balance -= trade.cost;
            } else if (trade.type === 'EXIT') {
                balance += trade.profit + (trade.entryPrice * trade.amount);
            }
            equityCurve.push(balance);
        }
        
        return equityCurve;
    }

    /**
     * 计算最大回撤
     */
    calculateMaxDrawdown(equityCurve) {
        let peak = equityCurve[0];
        let maxDrawdown = 0;
        
        for (let i = 1; i < equityCurve.length; i++) {
            if (equityCurve[i] > peak) {
                peak = equityCurve[i];
            }
            
            const drawdown = (peak - equityCurve[i]) / peak;
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
            }
        }
        
        return maxDrawdown;
    }

    /**
     * 计算夏普比率（简化版）
     */
    calculateSharpeRatio(trades) {
        if (trades.length < 2) return 0;
        
        const returns = trades
            .filter(t => t.type === 'EXIT')
            .map(t => t.profitPercent / 100);
        
        if (returns.length === 0) return 0;
        
        const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
        const stdDev = Math.sqrt(variance);
        
        // 假设无风险利率为0
        return stdDev > 0 ? meanReturn / stdDev : 0;
    }

    /**
     * 生成回测报告
     */
    async generateReport() {
        const report = {
            config: this.config,
            summary: {
                initialBalance: this.config.initialBalance,
                finalBalance: this.backtestBalance,
                netProfit: this.backtestBalance - this.config.initialBalance,
                ...this.results.metrics
            },
            trades: this.results.trades,
            charts: {
                equityCurve: this.calculateEquityCurve(this.results.trades.filter(t => t.success)),
                tradeDistribution: this.calculateTradeDistribution()
            },
            timestamp: new Date().toISOString()
        };
        
        // 保存报告到文件
        await this.saveReport(report);
        
        return report;
    }

    /**
     * 计算交易分布
     */
    calculateTradeDistribution() {
        const trades = this.results.trades.filter(t => t.success && t.type === 'EXIT');
        
        return {
            byProfit: {
                highProfit: trades.filter(t => t.profitPercent > 20).length,
                mediumProfit: trades.filter(t => t.profitPercent > 5 && t.profitPercent <= 20).length,
                lowProfit: trades.filter(t => t.profitPercent > 0 && t.profitPercent <= 5).length,
                loss: trades.filter(t => t.profitPercent <= 0).length
            },
            byTime: {
                // 这里可以根据时间分析交易分布
            }
        };
    }

    /**
     * 保存报告
     */
    async saveReport(report) {
        try {
            const reportsDir = path.join(__dirname, '../../reports');
            await fs.mkdir(reportsDir, { recursive: true });
            
            const filename = `backtest_${Date.now()}.json`;
            const filepath = path.join(reportsDir, filename);
            
            await fs.writeFile(filepath, JSON.stringify(report, null, 2));
            logger.info(`回测报告已保存: ${filepath}`);
            
        } catch (error) {
            logger.error('保存回测报告失败:', error.message);
        }
    }

    /**
     * 获取时间框架对应的毫秒数
     */
    getTimeFrameMs(timeFrame) {
        const timeFrames = {
            '1m': 60 * 1000,
            '5m': 5 * 60 * 1000,
            '15m': 15 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '4h': 4 * 60 * 60 * 1000,
            '1d': 24 * 60 * 60 * 1000
        };
        
        return timeFrames[timeFrame] || timeFrames['1h'];
    }

    /**
     * 重置回测引擎
     */
    reset() {
        this.paperTrading = new PaperTrading({ initialBalanceSOL: this.config.initialBalance });
        this.backtestBalance = this.config.initialBalance;
        this.results = {
            trades: [],
            metrics: {},
            charts: {}
        };
        logger.info('回测引擎已重置');
    }
}

module.exports = BacktestEngine;