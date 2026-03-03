require('dotenv').config();
const logger = require('./utils/logger');
const PriceFetcher = require('./core/price-fetcher');
const NeedleDetector = require('./strategy/needle-detector');
const RiskManager = require('./risk/risk-manager');
const PaperTrading = require('./simulation/paper-trading');
const MemoryIntegration = require('./memory/memory-integration');
const { startMonitoring, updateAPIMetrics, updateTradingMetrics } = require('./monitoring/monitoring-system');

// Solana 优化模块
const RPCNodeManager = require('./solana/rpc-manager');
const MEVProtection = require('./solana/mev-protection');
const TokenSecurityFilter = require('./solana/token-security');
const NetworkMonitor = require('./solana/network-monitor');

class NeedleBotEnhancedAI {
    constructor(config = {}) {
        this.config = {
            // 基础配置
            scanIntervalMs: parseInt(process.env.SCAN_INTERVAL_MS) || 5000,
            tradingEnabled: process.env.TRADING_ENABLED === 'true',
            initialBalanceSOL: parseFloat(process.env.INITIAL_BALANCE_SOL) || 1.0,
            maxPositionSizeSOL: parseFloat(process.env.MAX_POSITION_SIZE_SOL) || 0.1,
            minDropPercent: parseInt(process.env.MIN_DROP_PERCENT) || 20,
            minRecoveryPercent: parseInt(process.env.MIN_RECOVERY_PERCENT) || 50,
            
            // Solana 优化配置
            enableMEVProtection: process.env.ENABLE_MEV_PROTECTION === 'true' || true,
            enableTokenSecurity: process.env.ENABLE_TOKEN_SECURITY === 'true' || true,
            enableNetworkMonitoring: process.env.ENABLE_NETWORK_MONITORING === 'true' || true,
            maxSlippagePercent: parseFloat(process.env.MAX_SLIPPAGE_PERCENT) || 10.0,
            minTokenSecurityScore: parseInt(process.env.MIN_TOKEN_SECURITY_SCORE) || 70,
            
            ...config
        };

        this.initializeEnhancedComponents();
        this.isRunning = false;
        this.scanInterval = null;
        
        this.stats = {
            scans: 0,
            signals: 0,
            trades: 0,
            filteredSignals: 0,
            rejectedTokens: 0,
            startTime: Date.now()
        };

        // Solana 特定统计
        this.solanaStats = {
            rpcNodeSwitches: 0,
            mevProtectedTrades: 0,
            securityFilteredTokens: 0,
            networkDelayedTrades: 0,
            avgExecutionLatency: 0,
            totalExecutionLatency: 0
        };

        // 记忆系统
        this.memorySystem = null;
        this.userPreferences = {};
        
        // Solana 优化状态
        this.solanaOptimizations = {
            rpcReady: false,
            mevReady: false,
            securityReady: false,
            networkReady: false
        };
    }

    /**
     * 初始化增强组件
     */
    initializeEnhancedComponents() {
        logger.info('初始化 NeedleBot Enhanced AI 系统...');
        
        // 1. 基础组件
        this.priceFetcher = new PriceFetcher();
        this.detector = new NeedleDetector({
            minDropPercent: this.config.minDropPercent,
            minRecoveryPercent: this.config.minRecoveryPercent
        });
        this.riskManager = new RiskManager();
        this.paperTrading = new PaperTrading({
            initialBalanceSOL: this.config.initialBalanceSOL
        });
        
        // 2. Solana 优化组件
        this.initializeSolanaOptimizations();
        
        // 3. 记忆系统
        this.initializeMemorySystem();
        
        // 4. 监控系统
        startMonitoring();
        
        logger.info('NeedleBot Enhanced AI 初始化完成');
    }
    
    /**
     * 初始化 Solana 优化组件
     */
    async initializeSolanaOptimizations() {
        logger.info('初始化 Solana 优化组件...');
        
        try {
            // RPC 节点管理器
            if (this.config.enableNetworkMonitoring) {
                this.rpcManager = new RPCNodeManager();
                await this.rpcManager.initialize();
                this.solanaOptimizations.rpcReady = true;
                logger.info('✅ RPC 节点管理器初始化完成');
            }
            
            // MEV 防护
            if (this.config.enableMEVProtection) {
                this.mevProtection = new MEVProtection({
                    maxSlippagePercent: this.config.maxSlippagePercent
                });
                this.solanaOptimizations.mevReady = true;
                logger.info('✅ MEV 防护系统初始化完成');
            }
            
            // 代币安全过滤
            if (this.config.enableTokenSecurity) {
                this.tokenSecurity = new TokenSecurityFilter({
                    minSecurityScore: this.config.minTokenSecurityScore
                });
                this.solanaOptimizations.securityReady = true;
                logger.info('✅ 代币安全过滤系统初始化完成');
            }
            
            // 网络监控
            if (this.config.enableNetworkMonitoring) {
                this.networkMonitor = new NetworkMonitor();
                this.solanaOptimizations.networkReady = true;
                logger.info('✅ 网络监控系统初始化完成');
            }
            
            logger.info(`Solana 优化组件状态: ${Object.values(this.solanaOptimizations).filter(v => v).length}/4 就绪`);
            
        } catch (error) {
            logger.error('Solana 优化组件初始化失败:', error);
            logger.warn('将使用基础模式运行（无 Solana 优化）');
        }
    }
    
    /**
     * 初始化记忆系统
     */
    async initializeMemorySystem() {
        try {
            this.memorySystem = new MemoryIntegration();
            await this.memorySystem.initialize();
            
            // 加载用户偏好
            this.userPreferences = await this.memorySystem.getUserPreferences();
            logger.info('记忆系统初始化完成');
            
        } catch (error) {
            logger.error('记忆系统初始化失败:', error);
            this.memorySystem = null;
        }
    }
    
    /**
     * 启动增强扫描
     */
    async startEnhancedScan() {
        if (this.isRunning) {
            logger.warn('系统已经在运行中');
            return;
        }
        
        logger.info('启动 NeedleBot Enhanced AI 扫描...');
        this.isRunning = true;
        
        // 初始扫描
        await this.enhancedScanCycle();
        
        // 设置定时扫描
        this.scanInterval = setInterval(async () => {
            await this.enhancedScanCycle();
        }, this.config.scanIntervalMs);
        
        logger.info(`增强扫描已启动，间隔: ${this.config.scanIntervalMs}ms`);
    }
    
    /**
     * 增强扫描周期
     */
    async enhancedScanCycle() {
        const cycleStart = Date.now();
        this.stats.scans++;
        
        try {
            // 1. 检查网络状态
            if (!await this.checkNetworkConditions()) {
                logger.warn('网络条件不佳，跳过本次扫描');
                return;
            }
            
            // 2. 获取安全的代币列表
            const safeTokens = await this.getSafeTokenList();
            if (safeTokens.length === 0) {
                logger.debug('没有安全的代币可扫描');
                return;
            }
            
            // 3. 并行扫描代币
            const scanResults = await this.scanTokensWithProtection(safeTokens);
            
            // 4. 过滤和排序信号
            const validSignals = this.filterAndSortSignals(scanResults);
            
            // 5. 执行交易（如果启用）
            if (this.config.tradingEnabled && validSignals.length > 0) {
                await this.executeEnhancedTrades(validSignals);
            }
            
            // 6. 更新监控指标
            this.updateEnhancedMetrics(cycleStart, safeTokens.length, validSignals.length);
            
            // 7. 记录到记忆系统
            await this.recordEnhancedScan(safeTokens, validSignals);
            
        } catch (error) {
            logger.error('增强扫描周期失败:', error);
            updateAPIMetrics('scan_error', 1);
        }
    }
    
    /**
     * 检查网络条件
     */
    async checkNetworkConditions() {
        if (!this.solanaOptimizations.networkReady) {
            return true; // 如果没有网络监控，默认允许
        }
        
        try {
            const shouldTrade = await this.networkMonitor.shouldExecuteTrade();
            
            if (!shouldTrade) {
                this.solanaStats.networkDelayedTrades++;
                logger.debug('网络监控建议延迟交易');
            }
            
            return shouldTrade;
            
        } catch (error) {
            logger.error('网络条件检查失败:', error);
            return true; // 失败时默认允许
        }
    }
    
    /**
     * 获取安全的代币列表
     */
    async getSafeTokenList() {
        try {
            // 获取所有代币
            const allTokens = await this.priceFetcher.getSolanaMemeTokens();
            
            // 如果没有安全过滤，返回所有代币
            if (!this.solanaOptimizations.securityReady) {
                return allTokens.slice(0, 20); // 限制数量
            }
            
            // 并行安全分析
            const safetyResults = await Promise.allSettled(
                allTokens.map(async (token) => {
                    try {
                        const securityReport = await this.tokenSecurity.analyzeTokenSecurity(token.address);
                        
                        return {
                            ...token,
                            securityReport,
                            safe: securityReport.passed && 
                                 securityReport.score >= this.config.minTokenSecurityScore
                        };
                    } catch (error) {
                        logger.debug(`代币 ${token.symbol} 安全分析失败:`, error.message);
                        return { ...token, safe: false, error: error.message };
                    }
                })
            );
            
            // 过滤和排序
            const safeTokens = safetyResults
                .filter(result => result.status === 'fulfilled' && result.value.safe)
                .map(result => result.value)
                .sort((a, b) => b.securityReport.score - a.securityReport.score)
                .slice(0, 20); // 只保留前20个最安全的
            
            this.stats.rejectedTokens = allTokens.length - safeTokens.length;
            
            if (safeTokens.length === 0) {
                logger.warn('没有通过安全过滤的代币');
            } else {
                logger.debug(`安全过滤: ${safeTokens.length}/${allTokens.length} 个代币通过`);
            }
            
            return safeTokens;
            
        } catch (error) {
            logger.error('获取安全代币列表失败:', error);
            return [];
        }
    }
    
    /**
     * 带保护的代币扫描
     */
    async scanTokensWithProtection(tokens) {
        const scanPromises = tokens.map(async (token) => {
            try {
                // 获取价格数据
                const priceData = await this.priceFetcher.getTokenPriceData(token.address);
                
                if (!priceData || priceData.length < 10) {
                    return null;
                }
                
                // 检测信号
                const signal = await this.detector.detectNeedle(priceData);
                
                if (!signal.hasNeedle) {
                    return null;
                }
                
                // 增强信号信息
                const enhancedSignal = {
                    ...signal,
                    token: {
                        ...token,
                        currentPrice: priceData[priceData.length - 1].price,
                        volume24h: token.volume24h || 0,
                        liquidity: token.liquidity || 0
                    },
                    timestamp: Date.now(),
                    scanId: this.stats.scans
                };
                
                // 如果有安全报告，添加到信号
                if (token.securityReport) {
                    enhancedSignal.securityReport = token.securityReport;
                }
                
                return enhancedSignal;
                
            } catch (error) {
                logger.debug(`代币 ${token.symbol} 扫描失败:`, error.message);
                return null;
            }
        });
        
        const results = await Promise.allSettled(scanPromises);
        
        return results
            .filter(result => result.status === 'fulfilled' && result.value)
            .map(result => result.value);
    }
    
    /**
     * 过滤和排序信号
     */
    filterAndSortSignals(signals) {
        if (signals.length === 0) {
            return [];
        }
        
        // 基础过滤：置信度阈值
        let filtered = signals.filter(signal => 
            signal.confidence >= (this.config.confidenceThreshold || 80)
        );
        
        this.stats.filteredSignals = signals.length - filtered.length;
        
        // 如果有安全报告，基于安全分数进一步过滤
        if (this.solanaOptimizations.securityReady) {
            filtered = filtered.filter(signal => 
                signal.securityReport && 
                signal.securityReport.score >= this.config.minTokenSecurityScore
            );
        }
        
        // 排序：置信度 × 安全分数（如果可用）
        filtered.sort((a, b) => {
            const scoreA = a.confidence * (a.securityReport?.score || 100) / 100;
            const scoreB = b.confidence * (b.securityReport?.score || 100) / 100;
            return scoreB - scoreA;
        });
        
        // 限制数量
        return filtered.slice(0, 3); // 每次最多处理3个信号
    }
    
    /**
     * 执行增强交易
     */
    async executeEnhancedTrades(signals) {
        for (const signal of signals) {
            try {
                const tradeStart = Date.now();
                
                // 1. 风险评估
                const riskAssessment = await this.riskManager.assessTradeRisk(signal);
                if (!riskAssessment.approved) {
                    logger.info(`交易被风控拒绝: ${riskAssessment.reason}`);
                    continue;
                }
                
                // 2. 计算仓位
                const positionSize = this.calculateEnhancedPosition(signal, riskAssessment);
                
                // 3. 准备交易参数
                const tradeParams = await this.prepareEnhancedTradeParams(signal, positionSize);
                
                // 4. 执行交易（模拟或真实）
                const tradeResult = await this.executeTradeWithProtection(tradeParams);
                
                // 5. 记录交易
                await this.recordEnhancedTrade(signal, tradeParams, tradeResult, tradeStart);
                
                this.stats.trades++;
                
            } catch (error) {
                logger.error('增强交易执行失败:', error);
                updateTradingMetrics('execution_error', 1);
            }
        }
    }
    
    /**
     * 计算增强仓位
     */
    calculateEnhancedPosition(signal, riskAssessment) {
        // 基础仓位计算
        let positionSize = this.config.maxPositionSizeSOL * riskAssessment.riskScore;
        
        // 如果有安全报告，基于安全分数调整
        if (signal.securityReport) {
            const securityMultiplier = signal.securityReport.score / 100;
            positionSize *= securityMultiplier;
        }
        
        // 确保不超过最大限制
        return Math.min(positionSize, this.config.maxPositionSizeSOL);
    }
    
    /**
     * 准备增强交易参数
     */
    async prepareEnhancedTradeParams(signal, positionSize) {
        const params = {
            tokenAddress: signal.token.address,
            tokenSymbol: signal.token.symbol,
            positionSizeSOL: positionSize,
            entryPrice: signal.token.currentPrice,
            signalConfidence: signal.confidence,
            timestamp: Date.now()
        };
        
        // 添加 MEV 防护参数
        if (this.solanaOptimizations.mevReady) {
            params.slippage = await this.mevProtection.calculateDynamicSlippage(signal.token);
            params.mevProtection = 'enabled';
        } else {
            params.slippage = 0.02; // 默认 2%
            params.mevProtection = 'disabled';
        }
        
        // 添加安全信息
        if (signal.securityReport) {
            params.securityScore = signal.securityReport.score;
            params.securityLevel = signal.securityReport.securityLevel;
        }
        
        return params;
    }
    
    /**
     * 带保护的交易执行
     */
    async executeTradeWithProtection(tradeParams) {
        const executionStart = Date.now();
        
        // 目前使用模拟交易
        // TODO: 集成 Jupiter API 进行真实交易
        
        const mockResult = {
            success: true,
            simulated: true,
            transactionId: `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            executedPrice: tradeParams.entryPrice * (1 + (Math.random() * 0.02 - 0.01)), // 模拟价格变化
            positionSize: tradeParams.positionSizeSOL,
            fees: tradeParams.positionSizeSOL * 0.005, // 0.5% 费用
            timestamp: Date.now()
        };
        
        // 模拟执行延迟
        const executionTime = Date.now() - executionStart;
        await this.delay(executionTime);
        
        // 更新统计
        this.solanaStats.totalExecutionLatency += executionTime;
        this.solanaStats.avgExecutionLatency = 
            this.solanaStats.totalExecutionLatency / this.stats.trades;
        
        if (tradeParams.mevProtection === 'enabled') {
            this.solanaStats.mevProtectedTrades++;
        }
        
        return mockResult;
    }
    
    /**
     * 记录增强扫描
     */
    async recordEnhancedScan(tokens, signals) {
        if (!this.memorySystem) return;
        
        try {
            const scanRecord = {
                timestamp: Date.now(),
                scanId: this.stats.scans,
                tokensScanned: tokens.length,
                signalsDetected: signals.length,
                filteredSignals: this.stats.filteredSignals,
                rejectedTokens: this.stats.rejectedTokens,
                solanaStats: { ...this.solanaStats }
            };
            
            await this.memorySystem.storeMarketDataToMemory(scanRecord);
            
        } catch (error) {
            logger.error('记录增强扫描失败:', error);
        }
    }
    
    /**
     * 记录增强交易
     */
    async recordEnhancedTrade(signal, tradeParams, tradeResult, startTime) {
        if (!this.memorySystem) return;
        
        try {
            const tradeRecord = {
                timestamp: Date.now(),
                tradeId: this.stats.trades,
                signal: {
                    confidence: signal.confidence,
                    token: signal.token.symbol,
                    securityScore: signal.securityReport?.score
                },
                trade: {
                    params: tradeParams,
                    result: tradeResult,
                    executionTime: Date.now() - startTime
                },
                solanaOptimizations: {
                    mevProtection: tradeParams.mevProtection,
                    securityFilter: tradeParams.securityScore ? 'enabled' : 'disabled',
                    rpcNode: this.rpcManager?.currentNode?.name || 'default'
                }
            };
            
            await this.memorySystem.storeTradeToMemory(tradeRecord);
            
            // 更新用户偏好
            await this.updateTradingPreferences(tradeRecord);
            
        } catch (error) {
            logger.error('记录增强交易失败:', error);
        }
    }
    
    /**
     * 更新交易偏好
     */
    async updateTradingPreferences(tradeRecord) {
        if (!this.memorySystem) return;
        
        try {
            const preferences = {
                lastTradeTime: tradeRecord.timestamp,
                preferredTokens: [tradeRecord.signal.token],
                avgPositionSize: this.calculateAveragePositionSize(),
                successRate: this.calculateTradeSuccessRate(),
                riskTolerance: this.assessRiskTolerance()
            };
            
            await this.memorySystem.storeUserPreferences(preferences);
            this.userPreferences = preferences;
            
        } catch (error) {
            logger.error('更新交易偏好失败:', error);
        }
    }
    
    /**
     * 更新增强指标
     */
    updateEnhancedMetrics(cycleStart, tokensScanned, signalsFound) {
        const cycleTime = Date.now() - cycleStart;
        
        // 更新基础监控指标
        updateAPIMetrics('scan_time', cycleTime);
        updateAPIMetrics('tokens_scanned', tokensScanned);
        updateAPIMetrics('signals_found', signalsFound);
        
        // 更新 Solana 特定指标
        updateAPIMetrics('rpc_node_switches', this.solanaStats.rpcNodeSwitches);
        updateAPIMetrics('mev_protected_trades', this.solanaStats.mevProtectedTrades);
        updateAPIMetrics('security_filtered_tokens', this.solanaStats.securityFilteredTokens);
        updateAPIMetrics('avg_execution_latency', this.solanaStats.avgExecutionLatency);
        
        // 更新交易指标
        updateTradingMetrics('total_trades', this.stats.trades);
        updateTradingMetrics('filtered_signals', this.stats.filteredSignals);
    }
    
    /**
     * 计算平均仓位大小
     */
    calculateAveragePositionSize() {
        // 简化实现，实际应从记忆系统获取历史数据
        return this.config.maxPositionSizeSOL * 0.5;
    }
    
    /**
     * 计算交易成功率
     */
    calculateTradeSuccessRate() {
        // 简化实现，实际应从记忆系统获取历史数据
        return this.stats.trades > 0 ? 0.6 : 0.5;
    }
    
    /**
     * 评估风险容忍度
     */
    assessRiskTolerance() {
        // 基于历史表现动态调整
        const successRate = this.calculateTradeSuccessRate();
        
        if (successRate > 0.7) return 'high';
        if (successRate > 0.5) return 'medium';
        return 'low';
    }
    
    /**
     * 显示增强状态
     */
    displayEnhancedStatus() {
        console.log('\n' + '='.repeat(60));
        console.log('🚀 NeedleBot Enhanced AI - 系统状态');
        console.log('='.repeat(60));
        
        console.log(`📊 基础统计:`);
        console.log(`   扫描次数: ${this.stats.scans}`);
        console.log(`   检测信号: ${this.stats.signals}`);
        console.log(`   执行交易: ${this.stats.trades}`);
        console.log(`   过滤信号: ${this.stats.filteredSignals}`);
        console.log(`   运行时间: ${Math.floor((Date.now() - this.stats.startTime) / 1000)} 秒`);
        
        console.log(`\n🔧 Solana 优化状态:`);
        console.log(`   RPC 节点: ${this.solanaOptimizations.rpcReady ? '✅' : '❌'}`);
        console.log(`   MEV 防护: ${this.solanaOptimizations.mevReady ? '✅' : '❌'}`);
        console.log(`   安全过滤: ${this.solanaOptimizations.securityReady ? '✅' : '❌'}`);
        console.log(`   网络监控: ${this.solanaOptimizations.networkReady ? '✅' : '❌'}`);
        
        console.log(`\n📈 Solana 性能指标:`);
        console.log(`   节点切换: ${this.solanaStats.rpcNodeSwitches}`);
        console.log(`   MEV 保护交易: ${this.solanaStats.mevProtectedTrades}`);
        console.log(`   安全过滤代币: ${this.solanaStats.securityFilteredTokens}`);
        console.log(`   网络延迟交易: ${this.solanaStats.networkDelayedTrades}`);
        console.log(`   平均执行延迟: ${this.solanaStats.avgExecutionLatency.toFixed(2)}ms`);
        
        console.log(`\n🎯 配置设置:`);
        console.log(`   扫描间隔: ${this.config.scanIntervalMs}ms`);
        console.log(`   交易启用: ${this.config.tradingEnabled ? '是' : '否'}`);
        console.log(`   最大滑点: ${this.config.maxSlippagePercent}%`);
        console.log(`   最小安全分: ${this.config.minTokenSecurityScore}`);
        
        console.log(`\n💾 记忆系统: ${this.memorySystem ? '✅ 已启用' : '❌ 未启用'}`);
        
        if (this.rpcManager && this.rpcManager.currentNode) {
            console.log(`\n🌐 当前 RPC 节点: ${this.rpcManager.currentNode.name}`);
            console.log(`   类型: ${this.rpcManager.currentNode.type}`);
            console.log(`   成功率: ${(this.rpcManager.currentNode.successRate * 100).toFixed(1)}%`);
            console.log(`   延迟: ${this.rpcManager.currentNode.lastResponseTime}ms`);
        }
        
        console.log('='.repeat(60) + '\n');
    }
    
    /**
     * 停止增强扫描
     */
    stopEnhancedScan() {
        if (!this.isRunning) {
            logger.warn('系统未在运行');
            return;
        }
        
        logger.info('停止 NeedleBot Enhanced AI 扫描...');
        
        clearInterval(this.scanInterval);
        this.isRunning = false;
        
        // 停止 RPC 管理器
        if (this.rpcManager) {
            this.rpcManager.stop().catch(error => {
                logger.error('停止 RPC 管理器失败:', error);
            });
        }
        
        // 清理记忆系统
        if (this.memorySystem) {
            this.memorySystem.cleanup().catch(error => {
                logger.error('清理记忆系统失败:', error);
            });
        }
        
        logger.info('增强扫描已停止');
    }
    
    /**
     * 获取性能报告
     */
    getEnhancedPerformanceReport() {
        const runtimeSeconds = (Date.now() - this.stats.startTime) / 1000;
        const scansPerMinute = runtimeSeconds > 0 ? (this.stats.scans / runtimeSeconds * 60) : 0;
        const signalsPerScan = this.stats.scans > 0 ? (this.stats.signals / this.stats.scans) : 0;
        
        return {
            timestamp: Date.now(),
            runtime: {
                seconds: Math.floor(runtimeSeconds),
                formatted: `${Math.floor(runtimeSeconds / 60)}分${Math.floor(runtimeSeconds % 60)}秒`
            },
            performance: {
                scans: this.stats.scans,
                scansPerMinute: scansPerMinute.toFixed(2),
                signals: this.stats.signals,
                signalsPerScan: signalsPerScan.toFixed(2),
                trades: this.stats.trades,
                filteredSignals: this.stats.filteredSignals,
                rejectedTokens: this.stats.rejectedTokens
            },
            solanaOptimizations: {
                enabled: Object.values(this.solanaOptimizations).filter(v => v).length,
                total: Object.keys(this.solanaOptimizations).length,
                stats: { ...this.solanaStats }
            },
            recommendations: this.generateEnhancedRecommendations()
        };
    }
    
    /**
     * 生成增强建议
     */
    generateEnhancedRecommendations() {
        const recommendations = [];
        
        // 检查扫描频率
        if (this.stats.scans < 10) {
            recommendations.push({
                type: 'info',
                message: '扫描数据不足，建议运行更长时间收集数据',
                priority: 'low'
            });
        }
        
        // 检查信号质量
        if (this.stats.scans > 0 && this.stats.signals / this.stats.scans < 0.1) {
            recommendations.push({
                type: 'warning',
                message: '信号检测率较低，建议调整策略参数',
                priority: 'medium'
            });
        }
        
        // 检查 Solana 优化使用
        const enabledOptimizations = Object.values(this.solanaOptimizations).filter(v => v).length;
        if (enabledOptimizations < 2) {
            recommendations.push({
                type: 'warning',
                message: `仅启用了 ${enabledOptimizations}/4 个 Solana 优化`,
                suggestion: '考虑启用更多优化功能',
                priority: 'medium'
            });
        }
        
        // 检查 RPC 性能
        if (this.solanaStats.avgExecutionLatency > 1000) {
            recommendations.push({
                type: 'critical',
                message: `执行延迟过高: ${this.solanaStats.avgExecutionLatency.toFixed(2)}ms`,
                suggestion: '检查 RPC 节点性能或网络连接',
                priority: 'high'
            });
        }
        
        return recommendations;
    }
    
    /**
     * 延迟函数
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * 测试增强功能
     */
    async testEnhancedFeatures() {
        console.log('🧪 测试 NeedleBot Enhanced AI 功能...');
        
        const tests = [
            { name: 'RPC 连接', test: () => this.testRPCConnection() },
            { name: '代币安全过滤', test: () => this.testTokenSecurity() },
            { name: 'MEV 防护计算', test: () => this.testMEVProtection() },
            { name: '网络监控', test: () => this.testNetworkMonitoring() },
            { name: '信号检测', test: () => this.testSignalDetection() }
        ];
        
        const results = [];
        
        for (const test of tests) {
            try {
                console.log(`\n🔧 测试: ${test.name}...`);
                const result = await test.test();
                results.push({ name: test.name, success: true, result });
                console.log(`   ✅ ${test.name} 测试通过`);
            } catch (error) {
                console.log(`   ❌ ${test.name} 测试失败: ${error.message}`);
                results.push({ name: test.name, success: false, error: error.message });
            }
        }
        
        console.log('\n📋 测试结果汇总:');
        console.log('='.repeat(50));
        
        results.forEach(result => {
            const status = result.success ? '✅' : '❌';
            console.log(`${status} ${result.name}`);
        });
        
        const passed = results.filter(r => r.success).length;
        const total = results.length;
        
        console.log(`\n🎯 通过率: ${passed}/${total} (${((passed / total) * 100).toFixed(1)}%)`);
        
        return { passed, total, results };
    }
    
    async testRPCConnection() {
        if (!this.rpcManager) {
            throw new Error('RPC 管理器未初始化');
        }
        
        const status = await this.rpcManager.getNetworkStatus();
        if (!status.success) {
            throw new Error('RPC 连接测试失败');
        }
        
        return status.data;
    }
    
    async testTokenSecurity() {
        if (!this.tokenSecurity) {
            throw new Error('代币安全过滤未启用');
        }
        
        // 测试一个已知的安全代币 (SOL)
        const solAddress = 'So11111111111111111111111111111111111111112';
        const report = await this.tokenSecurity.analyzeTokenSecurity(solAddress);
        
        if (!report.passed) {
            throw new Error('SOL 代币安全测试失败');
        }
        
        return report;
    }
    
    async testMEVProtection() {
        if (!this.mevProtection) {
            throw new Error('MEV 防护未启用');
        }
        
        const mockTokenData = {
            volatility: 0.5,
            volume24h: 1000000,
            marketCap: 5000000
        };
        
        const slippage = await this.mevProtection.calculateDynamicSlippage(mockTokenData);
        
        if (slippage > this.config.maxSlippagePercent / 100) {
            throw new Error(`滑点计算异常: ${slippage}`);
        }
        
        return { slippage: slippage * 100 }; // 转换为百分比
    }
    
    async testNetworkMonitoring() {
        if (!this.networkMonitor) {
            throw new Error('网络监控未启用');
        }
        
        const shouldTrade = await this.networkMonitor.shouldExecuteTrade();
        return { shouldTrade };
    }
    
    async testSignalDetection() {
        // 创建模拟价格数据
        const mockPriceData = [];
        const basePrice = 100;
        
        for (let i = 0; i < 20; i++) {
            // 模拟插针：中间大幅下跌后恢复
            let price = basePrice;
            if (i === 10) price = basePrice * 0.7; // 下跌30%
            if (i === 11) price = basePrice * 0.9; // 部分恢复
            if (i === 12) price = basePrice * 1.1; // 超过原价
            
            mockPriceData.push({
                timestamp: Date.now() - (20 - i) * 30000, // 30秒间隔
                price: price + (Math.random() * 10 - 5), // 添加一些噪声
                volume: 10000 + Math.random() * 5000
            });
        }
        
        const signal = await this.detector.detectNeedle(mockPriceData);
        return signal;
    }
}

module.exports = NeedleBotEnhancedAI;