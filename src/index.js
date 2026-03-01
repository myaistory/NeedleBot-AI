require('dotenv').config();
const logger = require('./utils/logger');
const PriceFetcher = require('./core/price-fetcher');
const NeedleDetector = require('./strategy/needle-detector');
const RiskManager = require('./risk/risk-manager');
const PaperTrading = require('./simulation/paper-trading');
const MemoryIntegration = require('./memory/memory-integration');
const { startMonitoring, updateAPIMetrics, updateTradingMetrics } = require('./monitoring/monitoring-system');

class NeedleBotAI {
    constructor(config = {}) {
        this.config = {
            scanIntervalMs: parseInt(process.env.SCAN_INTERVAL_MS) || 5000,
            tradingEnabled: process.env.TRADING_ENABLED === 'true',
            initialBalanceSOL: parseFloat(process.env.INITIAL_BALANCE_SOL) || 1.0,
            maxPositionSizeSOL: parseFloat(process.env.MAX_POSITION_SIZE_SOL) || 0.1,
            minDropPercent: parseInt(process.env.MIN_DROP_PERCENT) || 20,
            minRecoveryPercent: parseInt(process.env.MIN_RECOVERY_PERCENT) || 50,
            ...config
        };

        this.initializeComponents();
        this.isRunning = false;
        this.scanInterval = null;
        
        this.stats = {
            scans: 0,
            signals: 0,
            trades: 0,
            startTime: Date.now()
        };

        // 记忆系统
        this.memorySystem = null;
        this.userPreferences = {};
    }

    /**
     * 初始化组件
     */
    initializeComponents() {
        logger.info('初始化 NeedleBot AI 系统...');
        
        // 数据获取
        this.priceFetcher = new PriceFetcher();
        
        // 策略引擎
        this.detector = new NeedleDetector({
            minDropPercent: this.config.minDropPercent,
            minRecoveryPercent: this.config.minRecoveryPercent
        });
        
        // 风控管理
        this.riskManager = new RiskManager({
            maxPositionSizeSOL: this.config.maxPositionSizeSOL
        });
        
        // 模拟交易
        this.trading = new PaperTrading({
            initialBalanceSOL: this.config.initialBalanceSOL
        });
        
        // 记忆系统
        try {
            console.log('🔧 正在创建记忆系统...');
            this.memorySystem = new MemoryIntegration({
                memoryDir: './memory',
                userId: 'needlebot_trader',
                enableShortTerm: true,
                enableUserProfiles: true,
                enableDocumentMemory: true
            });
            console.log('✅ 记忆系统创建成功:', this.memorySystem ? '是' : '否');
        } catch (error) {
            console.error('❌ 创建记忆系统失败:', error);
            this.memorySystem = null;
        }
        
        logger.info('系统组件初始化完成');
    }

    /**
     * 启动系统
     */
    async start() {
        if (this.isRunning) {
            logger.warn('系统已经在运行中');
            return;
        }

        try {
            logger.info('🚀 启动 NeedleBot AI 系统...');
            
            // 启动监控系统
            startMonitoring();
            logger.info('📊 监控系统已启动');
            
            this.isRunning = true;
            
            // 初始化记忆系统
            await this.initializeMemorySystem();
            
            // 初始扫描
            await this.performScan();
            
            // 设置定时扫描
            this.scanInterval = setInterval(
                () => this.performScan(),
                this.config.scanIntervalMs
            );
            
            logger.info(`✅ 系统已启动，扫描间隔: ${this.config.scanIntervalMs}ms`);
            
            // 显示系统状态
            this.displayStatus();
            
        } catch (error) {
            logger.error('启动系统失败:', error);
            updateAPIMetrics(false, 0, error);
            this.stop();
        }
    }

    /**
     * 初始化记忆系统
     */
    async initializeMemorySystem() {
        try {
            console.log('🧠 初始化记忆系统...');
            console.log('  检查 memorySystem:', this.memorySystem ? '存在' : 'null/undefined');
            console.log('  检查 memorySystem 类型:', typeof this.memorySystem);
            console.log('  检查 memorySystem 构造函数:', this.memorySystem?.constructor?.name);
            
            if (this.memorySystem) {
                console.log('记忆系统实例存在，开始初始化...');
                const initialized = await this.memorySystem.initialize();
                
                if (initialized) {
                    // 加载用户偏好
                    this.userPreferences = await this.memorySystem.loadUserPreferences();
                    console.log('用户偏好加载完成:', Object.keys(this.userPreferences).length, '项');
                    
                    // 根据用户偏好调整配置
                    this.adjustConfigByPreferences();
                    
                    console.log('✅ 记忆系统初始化完成');
                } else {
                    console.warn('记忆系统初始化失败，继续无记忆运行');
                }
            } else {
                console.warn('记忆系统未配置，跳过初始化');
            }
        } catch (error) {
            console.error('初始化记忆系统失败:', error);
            console.error('错误详情:', error.stack);
        }
    }

    /**
     * 根据用户偏好调整配置
     */
    adjustConfigByPreferences() {
        const prefs = this.userPreferences;
        
        // 调整风险承受能力
        if (prefs.risk_tolerance) {
            switch (prefs.risk_tolerance.value) {
                case 'low':
                    this.config.maxPositionSizeSOL = Math.min(this.config.maxPositionSizeSOL, 0.05);
                    logger.info('低风险偏好: 最大仓位调整为 5%');
                    break;
                case 'high':
                    this.config.maxPositionSizeSOL = Math.min(this.config.maxPositionSizeSOL, 0.15);
                    logger.info('高风险偏好: 最大仓位调整为 15%');
                    break;
                // medium 保持默认
            }
        }
        
        // 调整交易风格
        if (prefs.trading_style) {
            logger.info(`交易风格: ${prefs.trading_style.value}`);
        }
        
        // 更新记忆系统中的偏好
        this.memorySystem?.updateUserPreference('last_config_adjustment', {
            timestamp: new Date().toISOString(),
            maxPositionSize: this.config.maxPositionSizeSOL,
            riskTolerance: prefs.risk_tolerance?.value || 'medium'
        });
    }

    /**
     * 停止系统
     */
    stop() {
        if (!this.isRunning) {
            logger.warn('系统未在运行');
            return;
        }

        logger.info('正在停止系统...');
        this.isRunning = false;
        
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
        
        this.generateFinalReport();
        
        // 清理记忆系统资源
        if (this.memorySystem) {
            this.memorySystem.cleanup();
        }
        
        logger.info('系统已停止');
    }

    /**
     * 执行扫描
     */
    async performScan() {
        if (!this.isRunning) return;

        this.stats.scans++;
        const scanId = `scan_${Date.now()}`;
        const scanStartTime = Date.now();
        
        try {
            logger.debug(`开始扫描 #${this.stats.scans} (${scanId})`);
            
            // 1. 获取代币列表
            const apiStartTime = Date.now();
            const tokens = await this.priceFetcher.getSolanaMemeTokens();
            const apiResponseTime = Date.now() - apiStartTime;
            
            // 更新API监控指标
            updateAPIMetrics(tokens.length > 0, apiResponseTime, null);
            
            if (tokens.length === 0) {
                logger.warn('未获取到代币列表');
                updateAPIMetrics(false, apiResponseTime, new Error('未获取到代币列表'));
                return;
            }
            
            logger.debug(`扫描 ${tokens.length} 个代币`);
            
            // 2. 批量获取价格数据
            const tokenAddresses = tokens.map(t => t.address);
            const pricePromises = tokenAddresses.map(addr => 
                this.priceFetcher.getPriceHistory(addr, '5m')
            );
            
            const priceHistories = await Promise.all(pricePromises);
            
            // 2.1 存储市场数据到记忆系统
            await this.storeMarketDataToMemory(tokens, priceHistories);
            
            // 3. 检测插针信号
            const tokensWithHistory = tokens.map((token, index) => ({
                token,
                history: priceHistories[index] || []
            }));
            
            const signals = await this.detector.batchDetect(tokensWithHistory);
            
            // 4. 处理检测到的信号
            if (signals.length > 0) {
                logger.info(`检测到 ${signals.length} 个插针信号`);
                await this.processSignals(signals);
            } else {
                logger.debug('未检测到插针信号');
            }
            
            // 5. 检查现有持仓
            await this.checkOpenPositions();
            
            // 6. 更新统计
            this.updateStats(signals.length);
            
        } catch (error) {
            logger.error(`扫描失败 (${scanId}):`, error);
        }
    }

    /**
     * 存储市场数据到记忆系统
     */
    async storeMarketDataToMemory(tokens, priceHistories) {
        try {
            if (!this.memorySystem) return;
            
            for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i];
                const history = priceHistories[i];
                
                if (history && history.length > 0) {
                    const latestPrice = history[history.length - 1];
                    
                    const marketData = {
                        token: token.symbol,
                        address: token.address,
                        price: latestPrice.price,
                        timestamp: latestPrice.timestamp,
                        historyLength: history.length,
                        scanTime: new Date().toISOString()
                    };
                    
                    await this.memorySystem.storeMarketData(token.symbol, marketData);
                }
            }
            
            logger.debug(`存储了 ${tokens.length} 个代币的市场数据到记忆系统`);
        } catch (error) {
            logger.error('存储市场数据到记忆系统失败:', error);
        }
    }

    /**
     * 处理检测到的信号
     */
    async processSignals(signals) {
        for (const signalData of signals) {
            try {
                const { token, detection } = signalData;
                
                // 记录信号
                const signalLog = {
                    token: token.symbol,
                    address: token.address,
                    confidence: detection.confidence,
                    drop: detection.analysis?.dropPercentage,
                    recovery: detection.analysis?.recoveryEstimate,
                    timestamp: Date.now()
                };
                
                await logger.signal(signalLog);
                
                this.stats.signals++;
                
                // 存储信号到记忆系统
                await this.storeSignalToMemory(token, detection, signalLog);
                
                // 如果交易启用，执行风险评估
                if (this.config.tradingEnabled) {
                    await this.evaluateTrade(token, detection);
                }
                
            } catch (error) {
                logger.error('处理信号失败:', error);
            }
        }
    }

    /**
     * 存储信号到记忆系统
     */
    async storeSignalToMemory(token, detection, signalLog) {
        try {
            if (!this.memorySystem) return;
            
            const signalData = {
                id: `sig_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                token: token.symbol,
                address: token.address,
                confidence: detection.confidence,
                drop_percent: detection.analysis?.dropPercentage,
                recovery_percent: detection.analysis?.recoveryEstimate,
                timestamp: new Date().toISOString(),
                signal_type: 'needle_detection',
                metadata: {
                    analysis: detection.analysis,
                    raw_signal: detection
                }
            };
            
            await this.memorySystem.storeSignal(signalData);
            logger.debug(`信号存储到记忆系统: ${token.symbol} (置信度: ${detection.confidence}%)`);
            
            // 查询相似历史信号
            const similarSignals = await this.memorySystem.findSimilarTrades({
                token: token.symbol,
                drop_percent: detection.analysis?.dropPercentage
            }, 3);
            
            if (similarSignals.length > 0) {
                logger.info(`找到 ${similarSignals.length} 个相似历史信号`);
                // 可以在这里基于历史信号调整决策
            }
            
        } catch (error) {
            logger.error('存储信号到记忆系统失败:', error);
        }
    }

    /**
     * 评估交易机会
     */
    async evaluateTrade(token, signal) {
        try {
            // 1. 获取当前价格
            const priceData = await this.priceFetcher.getTokenPrice(token.address);
            if (!priceData) {
                logger.warn(`无法获取 ${token.symbol} 的价格数据`);
                return;
            }
            
            // 2. 风险评估
            const riskAssessment = await this.riskManager.assessRisk(
                token.address,
                signal,
                this.config.maxPositionSizeSOL
            );
            
            if (!riskAssessment.approved) {
                logger.warn(`交易未通过风险评估: ${token.symbol}, 原因: ${riskAssessment.recommendations.join(', ')}`);
                return;
            }
            
            // 3. 执行模拟交易
            const tradeResult = await this.trading.executeTrade(
                signal,
                {
                    address: token.address,
                    symbol: token.symbol,
                    name: token.name
                },
                this.config.maxPositionSizeSOL,
                priceData.priceUSD
            );
            
            if (tradeResult.success) {
                this.stats.trades++;
                
                // 记录交易
                const tradeLog = {
                    tradeId: tradeResult.tradeId,
                    token: token.symbol,
                    amount: this.config.maxPositionSizeSOL,
                    price: priceData.priceUSD,
                    confidence: signal.confidence,
                    riskLevel: riskAssessment.riskLevel,
                    timestamp: Date.now()
                };
                
                await logger.trade(tradeLog);
                
                // 更新交易监控指标
                updateTradingMetrics(true, true, true, tradeResult.profit || 0);
                
                // 存储交易记录到记忆系统
                await this.storeTradeToMemory(token, signal, tradeResult, priceData, riskAssessment, tradeLog);
                
                logger.info(`✅ 执行交易: ${token.symbol}, 交易ID: ${tradeResult.tradeId}`);
            }
            
        } catch (error) {
            logger.error(`评估交易失败 (${token.symbol}):`, error);
        }
    }

    /**
     * 存储交易记录到记忆系统
     */
    async storeTradeToMemory(token, signal, tradeResult, priceData, riskAssessment, tradeLog) {
        try {
            if (!this.memorySystem) return;
            
            const tradeRecord = {
                id: tradeResult.tradeId,
                token: token.symbol,
                address: token.address,
                action: 'buy', // NeedleBot 只做多
                entry_price: priceData.priceUSD,
                amount: this.config.maxPositionSizeSOL,
                confidence: signal.confidence,
                drop_percent: signal.analysis?.dropPercentage,
                recovery_percent: signal.analysis?.recoveryEstimate,
                risk_level: riskAssessment.riskLevel,
                risk_recommendations: riskAssessment.recommendations,
                timestamp: new Date().toISOString(),
                status: 'open',
                metadata: {
                    signal_data: signal,
                    trade_result: tradeResult,
                    price_data: priceData,
                    risk_assessment: riskAssessment
                }
            };
            
            await this.memorySystem.storeTrade(tradeRecord);
            logger.debug(`交易记录存储到记忆系统: ${token.symbol} (交易ID: ${tradeResult.tradeId})`);
            
            // 基于历史交易学习
            await this.learnFromHistoricalTrades(tradeRecord);
            
        } catch (error) {
            logger.error('存储交易记录到记忆系统失败:', error);
        }
    }

    /**
     * 从历史交易中学习
     */
    async learnFromHistoricalTrades(currentTrade) {
        try {
            if (!this.memorySystem) return;
            
            // 查询相似历史交易
            const similarTrades = await this.memorySystem.findSimilarTrades(currentTrade, 5);
            
            if (similarTrades.length > 0) {
                // 分析历史交易表现
                const profitableTrades = similarTrades.filter(t => t.metadata?.trade_result?.profitLossSOL > 0);
                const losingTrades = similarTrades.filter(t => t.metadata?.trade_result?.profitLossSOL <= 0);
                
                const successRate = profitableTrades.length / similarTrades.length;
                
                logger.info(`历史交易分析: ${similarTrades.length} 个相似交易`);
                logger.info(`  成功率: ${(successRate * 100).toFixed(1)}% (${profitableTrades.length}/${similarTrades.length})`);
                logger.info(`  平均盈利: ${profitableTrades.length > 0 ? 
                    (profitableTrades.reduce((sum, t) => sum + (t.metadata?.trade_result?.profitLossSOL || 0), 0) / profitableTrades.length).toFixed(4) : 0} SOL`);
                logger.info(`  平均亏损: ${losingTrades.length > 0 ? 
                    (losingTrades.reduce((sum, t) => sum + (t.metadata?.trade_result?.profitLossSOL || 0), 0) / losingTrades.length).toFixed(4) : 0} SOL`);
                
                // 如果成功率低，调整风险偏好
                if (successRate < 0.3 && this.userPreferences.risk_tolerance?.value === 'high') {
                    logger.warn('历史成功率低，建议降低风险偏好');
                    await this.memorySystem.updateUserPreference('risk_tolerance', 'medium');
                }
            }
            
        } catch (error) {
            logger.error('从历史交易学习失败:', error);
        }
    }

    /**
     * 检查现有持仓
     */
    async checkOpenPositions() {
        try {
            const openPositions = this.trading.positions.filter(p => p.status === 'open');
            
            for (const position of openPositions) {
                // 获取当前价格
                const priceData = await this.priceFetcher.getTokenPrice(position.tokenAddress);
                if (!priceData) continue;
                
                // 检查自动止盈止损
                const closedPosition = await this.trading.checkAutoClose(
                    position,
                    priceData.priceUSD
                );
                
                if (closedPosition) {
                    logger.info(`自动平仓: ${position.tokenSymbol}, 盈亏: ${closedPosition.profitLossSOL.toFixed(4)} SOL`);
                }
            }
        } catch (error) {
            logger.error('检查持仓失败:', error);
        }
    }

    /**
     * 更新统计信息
     */
    updateStats(newSignals) {
        const now = Date.now();
        const runtimeMinutes = (now - this.stats.startTime) / (1000 * 60);
        
        // 每5分钟记录一次状态
        if (runtimeMinutes % 5 < 0.1) {
            this.displayStatus();
        }
    }

    /**
     * 显示系统状态
     */
    displayStatus() {
        const runtimeMs = Date.now() - this.stats.startTime;
        const runtimeStr = this.formatRuntime(runtimeMs);
        
        const report = this.trading.generateReport();
        
        // 获取记忆系统状态
        let memoryStats = {};
        if (this.memorySystem) {
            memoryStats = this.memorySystem.getStats();
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 NEEDLEBOT AI 系统状态');
        console.log('='.repeat(60));
        console.log(`运行时间: ${runtimeStr}`);
        console.log(`扫描次数: ${this.stats.scans}`);
        console.log(`检测信号: ${this.stats.signals}`);
        console.log(`执行交易: ${this.stats.trades}`);
        console.log(`账户余额: ${report.balance.sol.toFixed(4)} SOL`);
        console.log(`持仓数量: ${report.stats.openPositions}`);
        console.log(`胜率: ${report.stats.winRate}%`);
        console.log(`总盈亏: ${report.stats.totalProfitSOL.toFixed(4)} SOL`);
        console.log(`最大回撤: ${report.stats.maxDrawdownSOL.toFixed(2)}%`);
        
        // 显示记忆系统状态
        if (memoryStats.isInitialized) {
            console.log('\n🧠 记忆系统状态:');
            console.log(`  类型: ${memoryStats.memoryType}`);
            console.log(`  市场数据存储: ${memoryStats.marketDataStored}`);
            console.log(`  信号存储: ${memoryStats.signalsStored}`);
            console.log(`  交易存储: ${memoryStats.tradesStored}`);
            console.log(`  查询次数: ${memoryStats.queriesPerformed}`);
            console.log(`  相似交易找到: ${memoryStats.similarTradesFound}`);
            console.log(`  用户偏好: ${Object.keys(this.userPreferences).length} 项`);
        } else {
            console.log('\n🧠 记忆系统: 未初始化');
        }
        
        console.log('='.repeat(60) + '\n');
    }

    /**
     * 生成最终报告
     */
    generateFinalReport() {
        const report = this.trading.generateReport();
        const runtimeMs = Date.now() - this.stats.startTime;
        const runtimeStr = this.formatRuntime(runtimeMs);
        
        const finalReport = {
            system: {
                runtime: runtimeStr,
                scans: this.stats.scans,
                signals: this.stats.signals,
                trades: this.stats.trades,
                startTime: new Date(this.stats.startTime).toISOString(),
                endTime: new Date().toISOString()
            },
            trading: report,
            config: this.config
        };
        
        logger.info('最终报告:', finalReport);
        return finalReport;
    }

    /**
     * 格式化运行时间
     */
    formatRuntime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    /**
     * 获取系统信息
     */
    getSystemInfo() {
        return {
            isRunning: this.isRunning,
            config: this.config,
            stats: this.stats,
            tradingReport: this.trading.generateReport(),
            timestamp: Date.now()
        };
    }
}

// 命令行接口
if (require.main === module) {
    const bot = new NeedleBotAI();
    
    // 处理命令行参数
    const args = process.argv.slice(2);
    const command = args[0];
    
    const executeCommand = async () => {
        switch (command) {
            case 'start':
                await bot.start();
                break;
                
            case 'stop':
                bot.stop();
                break;
                
            case 'status':
                console.log(JSON.stringify(bot.getSystemInfo(), null, 2));
                break;
                
            case 'report':
                console.log(JSON.stringify(bot.trading.generateReport(), null, 2));
                break;
                
            case 'reset':
                bot.trading.resetAccount();
                console.log('模拟账户已重置');
                break;
                
            default:
                console.log(`
NeedleBot AI - Solana Meme币插针交易系统

用法:
  npm start -- start     启动系统
  npm start -- stop      停止系统
  npm start -- status    查看状态
  npm start -- report    生成报告
  npm start -- reset     重置账户
  
配置:
  请编辑 .env 文件调整系统参数
                `);
                process.exit(0);
        }
    };
    
    executeCommand().catch(error => {
        console.error('命令执行失败:', error);
        process.exit(1);
    });
    
    // 处理退出信号
    process.on('SIGINT', () => {
        console.log('\n收到退出信号，正在停止系统...');
        bot.stop();
        process.exit(0);
    });
    
    process.on('SIGTERM', () => {
        console.log('\n收到终止信号，正在停止系统...');
        bot.stop();
        process.exit(0);
    });
}

module.exports = NeedleBotAI;