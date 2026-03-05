/**
 * NeedleBot AI 回测API
 * 提供回测功能的REST API接口
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const BacktestEngine = require('./backtest-engine');

// 创建回测引擎实例
const backtestEngine = new BacktestEngine();

/**
 * @route GET /api/backtest/status
 * @desc 获取回测状态
 */
router.get('/status', (req, res) => {
    try {
        const status = {
            engine: 'running',
            config: backtestEngine.config,
            lastRun: backtestEngine.results.timestamp || null,
            totalTrades: backtestEngine.results.trades.length
        };
        
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        logger.error('获取回测状态失败:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route POST /api/backtest/run
 * @desc 运行回测
 */
router.post('/run', async (req, res) => {
    try {
        const { symbol, startDate, endDate, timeFrame, initialBalance } = req.body;
        
        // 更新配置
        if (symbol) backtestEngine.config.symbol = symbol;
        if (startDate) backtestEngine.config.startDate = startDate;
        if (endDate) backtestEngine.config.endDate = endDate;
        if (timeFrame) backtestEngine.config.timeFrame = timeFrame;
        if (initialBalance) backtestEngine.config.initialBalance = parseFloat(initialBalance);
        
        logger.info('开始运行回测', { config: backtestEngine.config });
        
        // 重置引擎
        backtestEngine.reset();
        
        // 运行回测
        const report = await backtestEngine.runBacktest(symbol || 'SOL');
        
        res.json({
            success: true,
            data: report
        });
        
    } catch (error) {
        logger.error('运行回测失败:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route GET /api/backtest/results
 * @desc 获取回测结果
 */
router.get('/results', (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;
        
        const trades = backtestEngine.results.trades
            .slice(parseInt(offset), parseInt(offset) + parseInt(limit));
        
        res.json({
            success: true,
            data: {
                trades,
                metrics: backtestEngine.results.metrics,
                total: backtestEngine.results.trades.length,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });
    } catch (error) {
        logger.error('获取回测结果失败:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route GET /api/backtest/metrics
 * @desc 获取回测指标
 */
router.get('/metrics', (req, res) => {
    try {
        res.json({
            success: true,
            data: backtestEngine.results.metrics
        });
    } catch (error) {
        logger.error('获取回测指标失败:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route POST /api/backtest/config
 * @desc 更新回测配置
 */
router.post('/config', (req, res) => {
    try {
        const updates = req.body;
        
        Object.keys(updates).forEach(key => {
            if (backtestEngine.config.hasOwnProperty(key)) {
                backtestEngine.config[key] = updates[key];
            }
        });
        
        logger.info('回测配置已更新', { updates });
        
        res.json({
            success: true,
            data: backtestEngine.config
        });
    } catch (error) {
        logger.error('更新回测配置失败:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route POST /api/backtest/reset
 * @desc 重置回测引擎
 */
router.post('/reset', (req, res) => {
    try {
        backtestEngine.reset();
        
        res.json({
            success: true,
            message: '回测引擎已重置'
        });
    } catch (error) {
        logger.error('重置回测引擎失败:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route GET /api/backtest/charts/equity
 * @desc 获取资金曲线数据
 */
router.get('/charts/equity', (req, res) => {
    try {
        const trades = backtestEngine.results.trades.filter(t => t.success);
        const equityCurve = backtestEngine.calculateEquityCurve(trades);
        
        // 生成时间标签
        const timestamps = [];
        const startTime = Date.now() - (equityCurve.length * 3600000); // 假设每小时一个点
        for (let i = 0; i < equityCurve.length; i++) {
            timestamps.push(new Date(startTime + i * 3600000).toISOString());
        }
        
        res.json({
            success: true,
            data: {
                timestamps,
                equity: equityCurve,
                trades: trades.map(t => ({
                    timestamp: t.timestamp,
                    type: t.type,
                    profit: t.profit || 0
                }))
            }
        });
    } catch (error) {
        logger.error('获取资金曲线失败:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route GET /api/backtest/charts/distribution
 * @desc 获取交易分布数据
 */
router.get('/charts/distribution', (req, res) => {
    try {
        const distribution = backtestEngine.calculateTradeDistribution();
        
        res.json({
            success: true,
            data: distribution
        });
    } catch (error) {
        logger.error('获取交易分布失败:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route GET /api/backtest/export
 * @desc 导出回测报告
 */
router.get('/export', (req, res) => {
    try {
        const format = req.query.format || 'json';
        
        if (format === 'json') {
            const report = {
                config: backtestEngine.config,
                summary: backtestEngine.results.metrics,
                trades: backtestEngine.results.trades,
                timestamp: new Date().toISOString()
            };
            
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="backtest_report_${Date.now()}.json"`);
            res.send(JSON.stringify(report, null, 2));
            
        } else if (format === 'csv') {
            // 简化的CSV导出
            const trades = backtestEngine.results.trades;
            let csv = 'Type,Symbol,Action,Price,Amount,Profit,Timestamp\n';
            
            trades.forEach(trade => {
                if (trade.success) {
                    csv += `${trade.type},${trade.symbol || 'N/A'},${trade.action},${trade.price || trade.exitPrice || 0},${trade.amount || 0},${trade.profit || 0},${trade.timestamp}\n`;
                }
            });
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="backtest_trades_${Date.now()}.csv"`);
            res.send(csv);
            
        } else {
            res.status(400).json({
                success: false,
                error: '不支持的导出格式。支持: json, csv'
            });
        }
    } catch (error) {
        logger.error('导出回测报告失败:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route POST /api/backtest/compare
 * @desc 比较不同配置的回测结果
 */
router.post('/compare', async (req, res) => {
    try {
        const { configs } = req.body;
        
        if (!Array.isArray(configs) || configs.length === 0) {
            return res.status(400).json({
                success: false,
                error: '需要提供配置数组'
            });
        }
        
        const results = [];
        
        for (let i = 0; i < configs.length; i++) {
            const config = configs[i];
            const engine = new BacktestEngine(config);
            
            try {
                const report = await engine.runBacktest(config.symbol || 'SOL');
                results.push({
                    config,
                    metrics: report.summary,
                    success: true
                });
            } catch (error) {
                results.push({
                    config,
                    error: error.message,
                    success: false
                });
            }
        }
        
        // 分析比较结果
        const comparison = this.analyzeComparison(results);
        
        res.json({
            success: true,
            data: {
                results,
                comparison
            }
        });
        
    } catch (error) {
        logger.error('比较回测失败:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * 分析比较结果
 */
function analyzeComparison(results) {
    const successfulResults = results.filter(r => r.success);
    
    if (successfulResults.length === 0) {
        return { message: '没有成功的回测结果可供比较' };
    }
    
    // 找出最佳配置
    const bestByReturn = [...successfulResults].sort((a, b) => 
        b.metrics.totalReturn - a.metrics.totalReturn
    )[0];
    
    const bestByWinRate = [...successfulResults].sort((a, b) => 
        b.metrics.winRate - a.metrics.winRate
    )[0];
    
    const bestBySharpe = [...successfulResults].sort((a, b) => 
        (b.metrics.sharpeRatio || 0) - (a.metrics.sharpeRatio || 0)
    )[0];
    
    return {
        bestByReturn: {
            config: bestByReturn.config,
            metrics: bestByReturn.metrics
        },
        bestByWinRate: {
            config: bestByWinRate.config,
            metrics: bestByWinRate.metrics
        },
        bestBySharpe: {
            config: bestBySharpe.config,
            metrics: bestBySharpe.metrics
        },
        summary: {
            totalConfigs: results.length,
            successfulConfigs: successfulResults.length,
            avgReturn: successfulResults.reduce((sum, r) => sum + r.metrics.totalReturn, 0) / successfulResults.length,
            avgWinRate: successfulResults.reduce((sum, r) => sum + r.metrics.winRate, 0) / successfulResults.length
        }
    };
}

module.exports = router;