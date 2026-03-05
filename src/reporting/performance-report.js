/**
 * NeedleBot AI 性能报告系统
 * 生成交易性能分析和报告
 */

const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

class PerformanceReporter {
    constructor(config = {}) {
        this.config = {
            reportDir: path.join(__dirname, '../../reports'),
            chartDir: path.join(__dirname, '../../reports/charts'),
            ...config
        };
        
        this.ensureDirectories();
    }
    
    /**
     * 确保目录存在
     */
    async ensureDirectories() {
        try {
            await fs.mkdir(this.config.reportDir, { recursive: true });
            await fs.mkdir(this.config.chartDir, { recursive: true });
        } catch (error) {
            logger.error('创建报告目录失败:', error.message);
        }
    }
    
    /**
     * 生成日报
     */
    async generateDailyReport(trades, signals, date = new Date()) {
        const dateStr = date.toISOString().split('T')[0];
        
        const report = {
            type: 'daily',
            date: dateStr,
            generatedAt: new Date().toISOString(),
            summary: this.calculateDailySummary(trades, signals),
            trades: this.analyzeTrades(trades),
            signals: this.analyzeSignals(signals),
            recommendations: this.generateRecommendations(trades, signals)
        };
        
        // 保存报告
        const filepath = path.join(this.config.reportDir, `daily_${dateStr}.json`);
        await fs.writeFile(filepath, JSON.stringify(report, null, 2));
        
        // 生成文本版本
        const textReport = this.formatTextReport(report);
        const textFilepath = path.join(this.config.reportDir, `daily_${dateStr}.txt`);
        await fs.writeFile(textFilepath, textReport);
        
        logger.info(`日报已生成: ${filepath}`);
        return report;
    }
    
    /**
     * 生成周报
     */
    async generateWeeklyReport(trades, signals, weekStart = this.getWeekStart()) {
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        const report = {
            type: 'weekly',
            weekStart: weekStart.toISOString().split('T')[0],
            weekEnd: weekEnd.toISOString().split('T')[0],
            generatedAt: new Date().toISOString(),
            summary: this.calculateWeeklySummary(trades, signals),
            dailyBreakdown: await this.getDailyBreakdown(weekStart, weekEnd),
            topPerformers: this.getTopPerformers(trades),
            worstPerformers: this.getWorstPerformers(trades),
            recommendations: this.generateWeeklyRecommendations(trades, signals)
        };
        
        const filepath = path.join(this.config.reportDir, `weekly_${weekStart.toISOString().split('T')[0]}.json`);
        await fs.writeFile(filepath, JSON.stringify(report, null, 2));
        
        logger.info(`周报已生成: ${filepath}`);
        return report;
    }
    
    /**
     * 生成月报
     */
    async generateMonthlyReport(trades, signals, month = new Date().getMonth(), year = new Date().getFullYear()) {
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 0);
        
        const report = {
            type: 'monthly',
            month: month,
            year: year,
            monthStart: monthStart.toISOString().split('T')[0],
            monthEnd: monthEnd.toISOString().split('T')[0],
            generatedAt: new Date().toISOString(),
            summary: this.calculateMonthlySummary(trades, signals),
            weeklyBreakdown: await this.getWeeklyBreakdown(monthStart, monthEnd),
            performanceMetrics: this.calculatePerformanceMetrics(trades),
            riskMetrics: this.calculateRiskMetrics(trades),
            recommendations: this.generateMonthlyRecommendations(trades, signals)
        };
        
        const filepath = path.join(this.config.reportDir, `monthly_${year}_${String(month + 1).padStart(2, '0')}.json`);
        await fs.writeFile(filepath, JSON.stringify(report, null, 2));
        
        logger.info(`月报已生成: ${filepath}`);
        return report;
    }
    
    /**
     * 计算每日摘要
     */
    calculateDailySummary(trades, signals) {
        const todayTrades = trades.filter(t => 
            new Date(t.timestamp).toDateString() === new Date().toDateString()
        );
        
        const todaySignals = signals.filter(s => 
            new Date(s.timestamp).toDateString() === new Date().toDateString()
        );
        
        const totalProfit = todayTrades.reduce((sum, t) => sum + (t.profit || 0), 0);
        const winningTrades = todayTrades.filter(t => t.profit > 0).length;
        const losingTrades = todayTrades.filter(t => t.profit <= 0).length;
        
        return {
            totalTrades: todayTrades.length,
            winningTrades: winningTrades,
            losingTrades: losingTrades,
            winRate: todayTrades.length > 0 ? (winningTrades / todayTrades.length) * 100 : 0,
            totalProfit: totalProfit,
            totalSignals: todaySignals.length,
            signalsConverted: todayTrades.length,
            conversionRate: todaySignals.length > 0 ? (todayTrades.length / todaySignals.length) * 100 : 0
        };
    }
    
    /**
     * 分析交易
     */
    analyzeTrades(trades) {
        if (trades.length === 0) {
            return {
                total: 0,
                bySymbol: {},
                byReason: {},
                avgHoldingTime: 0,
                avgProfit: 0
            };
        }
        
        const bySymbol = {};
        const byReason = {};
        let totalHoldingTime = 0;
        let totalProfit = 0;
        
        for (const trade of trades) {
            // 按代币统计
            const symbol = trade.symbol || 'UNKNOWN';
            if (!bySymbol[symbol]) {
                bySymbol[symbol] = { count: 0, profit: 0 };
            }
            bySymbol[symbol].count++;
            bySymbol[symbol].profit += (trade.profit || 0);
            
            // 按平仓原因统计
            const reason = trade.reason || 'UNKNOWN';
            if (!byReason[reason]) {
                byReason[reason] = { count: 0, profit: 0 };
            }
            byReason[reason].count++;
            byReason[reason].profit += (trade.profit || 0);
            
            totalHoldingTime += (trade.holdingPeriod || 0);
            totalProfit += (trade.profit || 0);
        }
        
        return {
            total: trades.length,
            bySymbol: bySymbol,
            byReason: byReason,
            avgHoldingTime: totalHoldingTime / trades.length,
            avgProfit: totalProfit / trades.length
        };
    }
    
    /**
     * 分析信号
     */
    analyzeSignals(signals) {
        if (signals.length === 0) {
            return {
                total: 0,
                byConfidence: {},
                avgConfidence: 0
            };
        }
        
        const byConfidence = {
            high: 0,    // > 0.8
            medium: 0,  // 0.5-0.8
            low: 0      // < 0.5
        };
        
        let totalConfidence = 0;
        
        for (const signal of signals) {
            const confidence = signal.confidence || 0;
            totalConfidence += confidence;
            
            if (confidence > 0.8) {
                byConfidence.high++;
            } else if (confidence >= 0.5) {
                byConfidence.medium++;
            } else {
                byConfidence.low++;
            }
        }
        
        return {
            total: signals.length,
            byConfidence: byConfidence,
            avgConfidence: totalConfidence / signals.length
        };
    }
    
    /**
     * 生成建议
     */
    generateRecommendations(trades, signals) {
        const recommendations = [];
        
        if (trades.length === 0) {
            recommendations.push({
                type: 'info',
                message: '今日无交易，建议检查策略参数或市场条件'
            });
        } else {
            const winRate = trades.filter(t => t.profit > 0).length / trades.length;
            
            if (winRate < 0.4) {
                recommendations.push({
                    type: 'warning',
                    message: '胜率低于40%，建议优化策略或调整参数',
                    priority: 'high'
                });
            } else if (winRate > 0.7) {
                recommendations.push({
                    type: 'success',
                    message: '胜率超过70%，策略表现优秀',
                    priority: 'low'
                });
            }
        }
        
        if (signals.length > 0 && trades.length === 0) {
            recommendations.push({
                type: 'info',
                message: `检测到${signals.length}个信号但未执行交易，检查风险评估条件`,
                priority: 'medium'
            });
        }
        
        return recommendations;
    }
    
    /**
     * 计算性能指标
     */
    calculatePerformanceMetrics(trades) {
        if (trades.length === 0) {
            return {
                totalProfit: 0,
                avgProfit: 0,
                maxProfit: 0,
                maxLoss: 0,
                profitFactor: 0,
                sharpeRatio: 0
            };
        }
        
        const profits = trades.map(t => t.profit || 0);
        const winningTrades = profits.filter(p => p > 0);
        const losingTrades = profits.filter(p => p <= 0);
        
        const totalProfit = winningTrades.reduce((a, b) => a + b, 0);
        const totalLoss = Math.abs(losingTrades.reduce((a, b) => a + b, 0));
        
        return {
            totalProfit: totalProfit,
            avgProfit: profits.reduce((a, b) => a + b, 0) / profits.length,
            maxProfit: Math.max(...profits),
            maxLoss: Math.min(...profits),
            profitFactor: totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0,
            sharpeRatio: this.calculateSharpeRatio(profits)
        };
    }
    
    /**
     * 计算风险指标
     */
    calculateRiskMetrics(trades) {
        if (trades.length === 0) {
            return {
                maxDrawdown: 0,
                volatility: 0,
                var95: 0,
                cvar95: 0
            };
        }
        
        const profits = trades.map(t => t.profit || 0);
        const returns = profits.map(p => p / 1000); // 假设初始资金$1000
        
        // 计算波动率
        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.map(r => Math.pow(r - avgReturn, 2)).reduce((a, b) => a + b, 0) / returns.length;
        const volatility = Math.sqrt(variance);
        
        // 计算VaR (95%)
        const sortedReturns = [...returns].sort((a, b) => a - b);
        const varIndex = Math.floor(returns.length * 0.05);
        const var95 = sortedReturns[varIndex] || 0;
        
        // 计算CVaR (95%)
        const tailReturns = sortedReturns.slice(0, varIndex + 1);
        const cvar95 = tailReturns.reduce((a, b) => a + b, 0) / tailReturns.length;
        
        return {
            maxDrawdown: 0, // 需要权益曲线数据
            volatility: volatility,
            var95: var95,
            cvar95: cvar95
        };
    }
    
    /**
     * 计算夏普比率
     */
    calculateSharpeRatio(returns) {
        if (returns.length === 0) return 0;
        
        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.map(r => Math.pow(r - avgReturn, 2)).reduce((a, b) => a + b, 0) / returns.length;
        const stdDev = Math.sqrt(variance);
        
        return stdDev > 0 ? avgReturn / stdDev : 0;
    }
    
    /**
     * 格式化文本报告
     */
    formatTextReport(report) {
        const lines = [
            '=' .repeat(60),
            `NeedleBot AI ${report.type === 'daily' ? '日报' : report.type === 'weekly' ? '周报' : '月报'}`,
            '=' .repeat(60),
            '',
            `生成时间: ${report.generatedAt}`,
            '',
            '📊 性能摘要:',
            '-' .repeat(40),
            `总交易数: ${report.summary.totalTrades || report.summary.total || 0}`,
            `胜率: ${report.summary.winRate?.toFixed(2) || 0}%`,
            `总利润: $${report.summary.totalProfit?.toFixed(2) || 0}`,
            '',
            '💡 建议:',
            '-' .repeat(40)
        ];
        
        for (const rec of report.recommendations || []) {
            lines.push(`• ${rec.message}`);
        }
        
        lines.push('');
        lines.push('=' .repeat(60));
        
        return lines.join('\n');
    }
    
    /**
     * 获取一周的开始日期
     */
    getWeekStart(date = new Date()) {
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(date.setDate(diff));
    }
    
    /**
     * 获取表现最好的交易
     */
    getTopPerformers(trades, limit = 5) {
        return [...trades]
            .filter(t => t.profit > 0)
            .sort((a, b) => b.profit - a.profit)
            .slice(0, limit);
    }
    
    /**
     * 获取表现最差的交易
     */
    getWorstPerformers(trades, limit = 5) {
        return [...trades]
            .filter(t => t.profit < 0)
            .sort((a, b) => a.profit - b.profit)
            .slice(0, limit);
    }
    
    /**
     * 获取每日分解
     */
    async getDailyBreakdown(startDate, endDate) {
        // 实现每日数据分解逻辑
        return [];
    }
    
    /**
     * 获取每周分解
     */
    async getWeeklyBreakdown(startDate, endDate) {
        // 实现每周数据分解逻辑
        return [];
    }
}

module.exports = PerformanceReporter;