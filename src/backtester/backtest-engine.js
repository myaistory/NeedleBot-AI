/**
 * BacktestEngine - 历史回测引擎
 * 用于测试插针策略的历史表现
 */

const axios = require('axios');

class BacktestEngine {
    constructor(config = {}) {
        this.config = {
            initialCapital: config.initialCapital || 1, // SOL
            maxPosition: config.maxPosition || 0.5, // 最大仓位
            stopLoss: config.stopLoss || 5, // 止损%
            takeProfit: config.takeProfit || 20, // 止盈%
            ...config
        };
        
        this.trades = [];
        this.equity = [];
        this.capital = this.config.initialCapital;
    }
    
    // 获取历史数据
    async fetchHistoricalData(tokenAddress, days = 30) {
        // 使用 Birdeye API 获取历史数据
        try {
            const endTime = Math.floor(Date.now() / 1000);
            const startTime = endTime - (days * 24 * 60 * 60);
            
            const response = await axios.get(
                `https://public-api.birdeye.so/defi/v3/tokenhistoricaldata`,
                {
                    params: {
                        address: tokenAddress,
                        time_from: startTime,
                        time_to: endTime,
                        type: '1h'
                    },
                    headers: {
                        'x-api-key': process.env.BIRDEYE_API_KEY || ''
                    },
                    timeout: 10000
                }
            );
            
            return response.data?.data?.items || [];
        } catch (error) {
            console.error('[Backtest] 获取历史数据失败:', error.message);
            return [];
        }
    }
    
    // 模拟交易
    simulateTrade(entryPrice, exitPrice, type = 'BUY') {
        const pnl = type === 'BUY' 
            ? (exitPrice - entryPrice) / entryPrice * 100 
            : (entryPrice - exitPrice) / entryPrice * 100;
        
        // 止损/止盈检查
        if (pnl <= -this.config.stopLoss) {
            return { action: 'STOP_LOSS', pnl: -this.config.stopLoss };
        }
        if (pnl >= this.config.takeProfit) {
            return { action: 'TAKE_PROFIT', pnl: this.config.takeProfit };
        }
        
        return { action: 'HOLD', pnl };
    }
    
    // 运行回测
    async run(tokenAddress, days = 30) {
        console.log(`[Backtest] 开始回测 ${tokenAddress}, ${days}天...`);
        
        const data = await this.fetchHistoricalData(tokenAddress, days);
        
        if (data.length === 0) {
            console.log('[Backtest] 无历史数据');
            return this.getResults();
        }
        
        // 分析价格数据
        let inPosition = false;
        let entryPrice = 0;
        
        for (let i = 1; i < data.length; i++) {
            const current = data[i];
            const previous = data[i - 1];
            
            const priceChange = ((current.price - previous.price) / previous.price) * 100;
            
            // 买入信号: 插针检测 (跌幅 > 15%)
            if (!inPosition && priceChange <= -15) {
                inPosition = true;
                entryPrice = current.price;
                this.trades.push({
                    type: 'BUY',
                    price: entryPrice,
                    time: current.unixTime,
                    reason: 'NEEDLE_SIGNAL'
                });
            }
            
            // 卖出信号
            if (inPosition) {
                const result = this.simulateTrade(entryPrice, current.price);
                
                if (result.action !== 'HOLD') {
                    inPosition = false;
                    this.trades.push({
                        type: 'SELL',
                        price: current.price,
                        time: current.unixTime,
                        pnl: result.pnl,
                        action: result.action
                    });
                    
                    // 更新资金
                    const tradePnl = (result.pnl / 100) * this.config.maxPosition;
                    this.capital += tradePnl;
                }
            }
            
            // 记录权益
            this.equity.push({
                time: current.unixTime,
                value: this.capital
            });
        }
        
        console.log(`[Backtest] 完成. 交易次数: ${this.trades.length}`);
        return this.getResults();
    }
    
    // 获取结果
    getResults() {
        const winningTrades = this.trades.filter(t => t.pnl > 0).length;
        const totalTrades = this.trades.filter(t => t.type === 'SELL').length;
        
        return {
            trades: this.trades,
            equity: this.equity,
            stats: {
                totalTrades,
                winningTrades,
                winRate: totalTrades > 0 ? (winningTrades / totalTrades * 100).toFixed(2) : 0,
                finalCapital: this.capital,
                totalReturn: ((this.capital - this.config.initialCapital) / this.config.initialCapital * 100).toFixed(2)
            }
        };
    }
}

module.exports = BacktestEngine;
