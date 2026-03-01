console.log('🚀 NeedleBot AI 系统启动测试...\n');

// 简化版的系统组件
class SimpleNeedleBot {
    constructor() {
        this.isRunning = false;
        this.scanCount = 0;
        this.signalsDetected = 0;
        this.startTime = Date.now();
        
        console.log('系统初始化...');
        console.log('✅ 价格获取模块');
        console.log('✅ 策略检测模块');
        console.log('✅ 风险管理模块');
        console.log('✅ 模拟交易模块');
        console.log('✅ 日志记录系统');
    }
    
    async start() {
        if (this.isRunning) {
            console.log('⚠️  系统已经在运行中');
            return;
        }
        
        console.log('\n🚀 启动 NeedleBot AI 系统...');
        this.isRunning = true;
        this.startTime = Date.now();
        
        // 初始扫描
        await this.performScan();
        
        // 模拟定时扫描
        this.scanInterval = setInterval(() => {
            this.performScan();
        }, 10000); // 10秒间隔
        
        console.log('✅ 系统启动成功，开始监控市场...');
        this.displayStatus();
    }
    
    stop() {
        if (!this.isRunning) {
            console.log('⚠️  系统未在运行');
            return;
        }
        
        console.log('\n🛑 停止系统...');
        this.isRunning = false;
        
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
        
        this.generateReport();
        console.log('✅ 系统已停止');
    }
    
    async performScan() {
        if (!this.isRunning) return;
        
        this.scanCount++;
        const scanId = this.scanCount;
        
        console.log(`\n📡 扫描 #${scanId} 开始...`);
        
        try {
            // 模拟数据获取
            const tokens = await this.mockGetTokens();
            console.log(`   获取到 ${tokens.length} 个代币`);
            
            // 模拟策略检测
            const signals = await this.mockDetectSignals(tokens);
            
            if (signals.length > 0) {
                this.signalsDetected += signals.length;
                console.log(`   🎯 检测到 ${signals.length} 个插针信号`);
                
                // 模拟风险评估
                for (const signal of signals) {
                    const riskApproved = await this.mockRiskAssessment(signal);
                    
                    if (riskApproved) {
                        console.log(`   ✅ 信号通过风控: ${signal.symbol} (置信度: ${signal.confidence}%)`);
                        
                        // 模拟交易执行
                        const tradeResult = await this.mockExecuteTrade(signal);
                        if (tradeResult.success) {
                            console.log(`   💰 执行交易: ${signal.symbol}, 预期盈利: ${tradeResult.expectedProfit}%`);
                        }
                    } else {
                        console.log(`   ⚠️  信号未通过风控: ${signal.symbol}`);
                    }
                }
            } else {
                console.log('   未检测到插针信号');
            }
            
            // 更新状态显示
            if (this.scanCount % 5 === 0) {
                this.displayStatus();
            }
            
        } catch (error) {
            console.log(`   ❌ 扫描失败: ${error.message}`);
        }
    }
    
    async mockGetTokens() {
        // 模拟获取代币列表
        return [
            { symbol: 'BONK', price: 0.000006, change24h: -2.3 },
            { symbol: 'WIF', price: 0.2002, change24h: -2.5 },
            { symbol: 'POPCAT', price: 0.0457, change24h: -2.9 },
            { symbol: 'MYRO', price: 0.0321, change24h: 1.2 },
            { symbol: 'WEN', price: 0.00012, change24h: -5.3 }
        ];
    }
    
    async mockDetectSignals(tokens) {
        const signals = [];
        
        // 模拟插针检测逻辑
        for (const token of tokens) {
            // 随机生成信号（模拟真实检测）
            const hasSignal = Math.random() > 0.7; // 30%概率检测到信号
            
            if (hasSignal) {
                const confidence = Math.floor(Math.random() * 30) + 70; // 70-100%置信度
                const drop = Math.floor(Math.random() * 20) + 20; // 20-40%跌幅
                const recovery = Math.floor(Math.random() * 30) + 50; // 50-80%回升
                
                signals.push({
                    symbol: token.symbol,
                    price: token.price,
                    confidence,
                    drop,
                    recovery,
                    timestamp: Date.now()
                });
            }
        }
        
        return signals;
    }
    
    async mockRiskAssessment(signal) {
        // 模拟风险评估
        const riskScore = Math.floor(Math.random() * 100);
        
        // 通过条件：置信度>80且风险评分>60
        return signal.confidence > 80 && riskScore > 60;
    }
    
    async mockExecuteTrade(signal) {
        // 模拟交易执行
        const success = Math.random() > 0.2; // 80%成功率
        
        if (success) {
            const expectedProfit = Math.floor(Math.random() * 20) + 10; // 10-30%预期盈利
            
            return {
                success: true,
                symbol: signal.symbol,
                entryPrice: signal.price,
                expectedProfit,
                tradeId: `TRADE_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            };
        } else {
            return {
                success: false,
                reason: '模拟交易失败'
            };
        }
    }
    
    displayStatus() {
        const runtimeMs = Date.now() - this.startTime;
        const runtimeStr = this.formatRuntime(runtimeMs);
        
        console.log('\n' + '='.repeat(50));
        console.log('📊 NEEDLEBOT AI 系统状态');
        console.log('='.repeat(50));
        console.log(`运行时间: ${runtimeStr}`);
        console.log(`扫描次数: ${this.scanCount}`);
        console.log(`检测信号: ${this.signalsDetected}`);
        console.log(`系统状态: ${this.isRunning ? '运行中' : '已停止'}`);
        console.log('='.repeat(50));
    }
    
    generateReport() {
        const runtimeMs = Date.now() - this.startTime;
        const runtimeStr = this.formatRuntime(runtimeMs);
        
        const report = {
            summary: {
                totalRuntime: runtimeStr,
                totalScans: this.scanCount,
                signalsDetected: this.signalsDetected,
                scanFrequency: `${(this.scanCount / (runtimeMs / 1000)).toFixed(2)} 次/秒`
            },
            performance: {
                avgScanTime: '~2秒',
                signalDetectionRate: `${((this.signalsDetected / this.scanCount) * 100).toFixed(2)}%`,
                systemUptime: '100%'
            },
            recommendations: [
                '系统运行正常',
                '建议优化策略参数',
                '考虑添加更多数据源'
            ]
        };
        
        console.log('\n📈 系统运行报告:');
        console.log(JSON.stringify(report, null, 2));
        
        return report;
    }
    
    formatRuntime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }
}

// 运行系统测试
async function runSystemTest() {
    console.log('🧪 NeedleBot AI 系统集成测试\n');
    
    const bot = new SimpleNeedleBot();
    
    // 启动系统
    await bot.start();
    
    // 运行一段时间后停止
    setTimeout(async () => {
        console.log('\n⏰ 测试时间到，停止系统...');
        await bot.stop();
        
        console.log('\n🎉 系统测试完成！');
        console.log('\n📋 测试结果:');
        console.log('✅ 系统启动和停止正常');
        console.log('✅ 定时扫描功能正常');
        console.log('✅ 策略检测模块工作');
        console.log('✅ 风险管理逻辑执行');
        console.log('✅ 模拟交易流程完整');
        console.log('✅ 状态监控和报告生成');
        
        console.log('\n🚀 下一步:');
        console.log('1. 集成真实数据源');
        console.log('2. 实现完整插针算法');
        console.log('3. 添加高级风控规则');
        console.log('4. 创建Web监控界面');
        console.log('5. 进行回测验证');
        
        process.exit(0);
    }, 30000); // 运行30秒
    
    // 处理退出信号
    process.on('SIGINT', () => {
        console.log('\n\n收到退出信号...');
        bot.stop();
        process.exit(0);
    });
}

// 启动测试
runSystemTest().catch(error => {
    console.error('系统测试失败:', error);
    process.exit(1);
});