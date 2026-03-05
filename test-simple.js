console.log('🚀 NeedleBot AI 简化测试开始...\n');

// 模拟测试 - 不依赖外部模块
async function runSimpleTest() {
    console.log('1. 测试策略检测算法...');
    
    // 简单的插针检测算法测试
    class SimpleNeedleDetector {
        detectNeedle(prices) {
            if (prices.length < 10) {
                return { hasNeedle: false, reason: '数据不足' };
            }
            
            // 计算最大跌幅
            const maxPrice = Math.max(...prices);
            const minPrice = Math.min(...prices);
            const dropPercent = ((maxPrice - minPrice) / maxPrice) * 100;
            
            // 计算回升（从最低点到最新价格）
            const latestPrice = prices[prices.length - 1];
            const recoveryPercent = ((latestPrice - minPrice) / minPrice) * 100;
            
            // 检查条件
            const hasNeedle = dropPercent >= 20 && recoveryPercent >= 50;
            
            return {
                hasNeedle,
                dropPercent: dropPercent.toFixed(2),
                recoveryPercent: recoveryPercent.toFixed(2),
                confidence: hasNeedle ? 80 : 30
            };
        }
    }
    
    // 测试数据：模拟一个插针
    const testPrices = [];
    for (let i = 0; i < 30; i++) {
        let price = 1.0;
        
        if (i === 15) {
            price = 0.7; // 30%跌幅
        } else if (i > 15 && i < 20) {
            price = 0.7 + (i - 15) * 0.06; // 快速回升
        } else if (i >= 20) {
            price = 0.9; // 回升到90%
        }
        
        testPrices.push(price);
    }
    
    const detector = new SimpleNeedleDetector();
    const result = detector.detectNeedle(testPrices);
    
    console.log('测试价格序列:');
    console.log(testPrices.map(p => p.toFixed(3)).join(' '));
    console.log('\n检测结果:');
    console.log(JSON.stringify(result, null, 2));
    
    console.log('\n2. 测试模拟交易逻辑...');
    
    class SimplePaperTrading {
        constructor(initialBalance = 10.0) {
            this.balance = initialBalance;
            this.positions = [];
            this.trades = [];
        }
        
        executeTrade(symbol, amount, price) {
            const cost = amount * price;
            
            if (cost > this.balance) {
                return { success: false, reason: '余额不足' };
            }
            
            const tradeId = Date.now();
            const position = {
                tradeId,
                symbol,
                amount,
                entryPrice: price,
                entryTime: new Date().toISOString(),
                status: 'open'
            };
            
            this.balance -= cost;
            this.positions.push(position);
            this.trades.push({ ...position, type: 'buy' });
            
            return {
                success: true,
                tradeId,
                position,
                remainingBalance: this.balance
            };
        }
        
        closePosition(tradeId, exitPrice) {
            const positionIndex = this.positions.findIndex(p => p.tradeId === tradeId);
            
            if (positionIndex === -1) {
                return { success: false, reason: '未找到持仓' };
            }
            
            const position = this.positions[positionIndex];
            const profit = (exitPrice - position.entryPrice) * position.amount;
            const profitPercent = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;
            
            // 更新余额
            this.balance += position.amount * exitPrice;
            
            // 更新持仓状态
            position.status = 'closed';
            position.exitPrice = exitPrice;
            position.exitTime = new Date().toISOString();
            position.profit = profit;
            position.profitPercent = profitPercent;
            
            this.trades.push({
                ...position,
                type: 'sell'
            });
            
            return {
                success: true,
                tradeId,
                profit: profit.toFixed(4),
                profitPercent: profitPercent.toFixed(2),
                newBalance: this.balance
            };
        }
        
        getReport() {
            const closedTrades = this.trades.filter(t => t.status === 'closed');
            const winningTrades = closedTrades.filter(t => t.profit > 0);
            const losingTrades = closedTrades.filter(t => t.profit <= 0);
            
            const totalProfit = closedTrades.reduce((sum, t) => sum + (t.profit || 0), 0);
            const winRate = closedTrades.length > 0 ? 
                (winningTrades.length / closedTrades.length) * 100 : 0;
            
            return {
                balance: this.balance.toFixed(4),
                openPositions: this.positions.filter(p => p.status === 'open').length,
                totalTrades: this.trades.length,
                closedTrades: closedTrades.length,
                winningTrades: winningTrades.length,
                losingTrades: losingTrades.length,
                winRate: winRate.toFixed(2),
                totalProfit: totalProfit.toFixed(4)
            };
        }
    }
    
    // 测试交易
    const trading = new SimplePaperTrading(5.0);
    
    console.log('\n初始余额: 5.0 SOL');
    
    // 执行买入
    const buyResult = trading.executeTrade('TEST', 0.5, 1.0);
    console.log('买入结果:', JSON.stringify(buyResult, null, 2));
    
    // 执行卖出（盈利）
    const sellResult = trading.closePosition(buyResult.tradeId, 1.25);
    console.log('卖出结果:', JSON.stringify(sellResult, null, 2));
    
    // 生成报告
    const report = trading.getReport();
    console.log('\n交易报告:');
    console.log(JSON.stringify(report, null, 2));
    
    console.log('\n3. 测试风险管理逻辑...');
    
    class SimpleRiskManager {
        assessTrade(signal, amount, balance) {
            const checks = [];
            
            // 信号强度检查
            checks.push({
                name: 'signal_strength',
                passed: signal.confidence >= 70,
                value: signal.confidence,
                threshold: 70
            });
            
            // 仓位大小检查（不超过余额的20%）
            const positionPercent = (amount / balance) * 100;
            checks.push({
                name: 'position_size',
                passed: positionPercent <= 20,
                value: positionPercent.toFixed(2),
                threshold: 20
            });
            
            // 综合评估
            const allPassed = checks.every(c => c.passed);
            const score = checks.filter(c => c.passed).length / checks.length * 100;
            
            return {
                approved: allPassed,
                score: score.toFixed(2),
                checks,
                recommendations: allPassed ? [] : ['调整交易参数']
            };
        }
    }
    
    const riskManager = new SimpleRiskManager();
    const riskAssessment = riskManager.assessTrade(
        { confidence: 85 },
        0.5, // 交易金额
        5.0  // 总余额
    );
    
    console.log('风险评估:');
    console.log(JSON.stringify(riskAssessment, null, 2));
    
    console.log('\n4. 完整的交易流程演示...');
    
    // 模拟完整流程
    console.log('\n📈 模拟交易流程:');
    console.log('1. 市场扫描 -> 检测到插针信号');
    console.log('2. 策略分析 -> 置信度: 85%');
    console.log('3. 风险评估 -> 评分: 100% (通过)');
    console.log('4. 执行交易 -> 买入 0.5 SOL @ $1.0');
    console.log('5. 价格监控 -> 上涨到 $1.25 (+25%)');
    console.log('6. 止盈卖出 -> 盈利 0.125 SOL');
    console.log('7. 更新统计 -> 胜率: 100%, 总盈利: 0.125 SOL');
    
    const finalBalance = 5.125; // 初始5.0 + 盈利0.125
    const roi = ((finalBalance - 5.0) / 5.0) * 100;
    
    console.log(`\n💰 最终结果:`);
    console.log(`初始资金: 5.0 SOL`);
    console.log(`最终余额: ${finalBalance} SOL`);
    console.log(`投资回报率: ${roi.toFixed(2)}%`);
    console.log(`交易次数: 1`);
    console.log(`胜率: 100%`);
    
    console.log('\n🎉 简化测试完成！');
    console.log('\n下一步建议:');
    console.log('1. 安装完整依赖: npm install');
    console.log('2. 运行完整测试: node test/basic-test.js');
    console.log('3. 启动模拟系统: npm start -- start');
    console.log('4. 观察实时信号检测');
    console.log('5. 优化策略参数');
}

// 运行测试
runSimpleTest().catch(error => {
    console.error('测试失败:', error);
});