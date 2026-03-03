/**
 * NeedleBot AI 记忆系统集成模块
 * 将分层记忆系统集成到 NeedleBot 主程序中
 */

const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class MemoryIntegration {
    constructor(config = {}) {
        try {
            console.log('🔧 MemoryIntegration 构造函数开始...');
            this.config = {
                memoryDir: config.memoryDir || './memory',
                enableShortTerm: config.enableShortTerm !== false,
                enableUserProfiles: config.enableUserProfiles !== false,
                enableDocumentMemory: config.enableDocumentMemory !== false,
                enableRollingSummary: config.enableRollingSummary !== false,
                ...config
            };

            console.log('🔧 配置设置完成:', this.config.memoryDir);
            this.memoryManager = null;
            this.isInitialized = false;
            
            // 用户ID（默认为系统用户）
            this.userId = config.userId || 'needlebot_system';
            
            // 记忆统计
            this.stats = {
                marketDataStored: 0,
                signalsStored: 0,
                tradesStored: 0,
                queriesPerformed: 0,
                similarTradesFound: 0,
                errors: 0
            };
            
            console.log('✅ MemoryIntegration 构造函数完成');
        } catch (error) {
            console.error('❌ MemoryIntegration 构造函数错误:', error);
            console.error('错误堆栈:', error.stack);
            throw error; // 重新抛出错误
        }
    }

    /**
     * 初始化记忆系统
     */
    async initialize() {
        try {
            console.log('🧠 初始化 NeedleBot 记忆系统...');
            
            // 确保记忆目录存在
            await fs.mkdir(this.config.memoryDir, { recursive: true });
            
            // 尝试使用 Python 记忆管理器
            await this._initializePythonMemory();
            
            if (!this.memoryManager) {
                console.log('⚠️ Python 记忆管理器不可用，使用简化 JavaScript 实现');
                await this._initializeJsMemory();
            }
            
            this.isInitialized = true;
            console.log('✅ 记忆系统初始化完成');
            
            // 加载用户偏好
            await this.loadUserPreferences();
            
            return true;
            
        } catch (error) {
            console.error('❌ 初始化记忆系统失败:', error);
            this.stats.errors++;
            return false;
        }
    }

    /**
     * 初始化 Python 记忆管理器
     */
    async _initializePythonMemory() {
        // 暂时禁用 Python 集成，使用 JavaScript 实现
        console.log('⚠️ Python 集成暂时禁用，使用 JavaScript 实现');
        return false;
    }

    /**
     * 初始化 JavaScript 记忆管理器（简化版）
     */
    async _initializeJsMemory() {
        try {
            // 创建简化的 JavaScript 记忆管理器
            const memoryData = {
                marketData: {},
                signals: [],
                trades: [],
                userPreferences: {},
                conversations: []
            };
            
            // 加载现有数据
            await this._loadMemoryData(memoryData);
            
            this.memoryManager = {
                type: 'javascript',
                data: memoryData,
                
                // 存储市场数据
                storeMarketData: async (token, data) => {
                    try {
                        const key = `${token}_${Date.now()}`;
                        memoryData.marketData[key] = {
                            token,
                            data,
                            timestamp: Date.now(),
                            expiresAt: Date.now() + (5 * 60 * 1000) // 5分钟
                        };
                        
                        // 清理过期数据
                        this._cleanExpiredData(memoryData.marketData);
                        
                        // 保存到文件
                        await this._saveMemoryData(memoryData);
                        
                        this.stats.marketDataStored++;
                        return true;
                    } catch (error) {
                        console.error('存储市场数据失败:', error);
                        this.stats.errors++;
                        return false;
                    }
                },
                
                // 存储交易信号
                storeSignal: async (signal) => {
                    try {
                        memoryData.signals.push({
                            ...signal,
                            timestamp: Date.now(),
                            storedAt: new Date().toISOString()
                        });
                        
                        // 限制信号数量
                        if (memoryData.signals.length > 100) {
                            memoryData.signals = memoryData.signals.slice(-100);
                        }
                        
                        // 保存到文件
                        await this._saveMemoryData(memoryData);
                        
                        this.stats.signalsStored++;
                        return true;
                    } catch (error) {
                        console.error('存储交易信号失败:', error);
                        this.stats.errors++;
                        return false;
                    }
                },
                
                // 查询相似交易
                findSimilarTrades: async (currentTrade, limit = 3) => {
                    try {
                        const token = currentTrade.token || '';
                        const action = currentTrade.action || '';
                        
                        // 简单关键词匹配
                        const similar = memoryData.trades
                            .filter(trade => {
                                const matchToken = token && trade.token === token;
                                const matchAction = action && trade.action === action;
                                return matchToken || matchAction;
                            })
                            .slice(-limit * 2)
                            .slice(0, limit);
                        
                        this.stats.queriesPerformed++;
                        this.stats.similarTradesFound += similar.length;
                        return similar;
                    } catch (error) {
                        console.error('查询相似交易失败:', error);
                        this.stats.errors++;
                        return [];
                    }
                },
                
                // 存储用户偏好
                storeUserPreference: async (preference, value) => {
                    try {
                        if (!memoryData.userPreferences[this.userId]) {
                            memoryData.userPreferences[this.userId] = {};
                        }
                        
                        memoryData.userPreferences[this.userId][preference] = {
                            value,
                            timestamp: Date.now(),
                            updatedAt: new Date().toISOString()
                        };
                        
                        await this._saveMemoryData(memoryData);
                        return true;
                    } catch (error) {
                        console.error('存储用户偏好失败:', error);
                        this.stats.errors++;
                        return false;
                    }
                },
                
                // 获取用户偏好
                getUserPreferences: async () => {
                    try {
                        return memoryData.userPreferences[this.userId] || {};
                    } catch (error) {
                        console.error('获取用户偏好失败:', error);
                        this.stats.errors++;
                        return {};
                    }
                },
                
                // 导出报告
                exportReport: async () => {
                    try {
                        const report = {
                            stats: this.stats,
                            memoryData: {
                                marketDataCount: Object.keys(memoryData.marketData).length,
                                signalsCount: memoryData.signals.length,
                                tradesCount: memoryData.trades.length,
                                userCount: Object.keys(memoryData.userPreferences).length
                            },
                            timestamp: new Date().toISOString()
                        };
                        
                        const reportFile = path.join(this.config.memoryDir, `memory_report_${Date.now()}.json`);
                        await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
                        
                        console.log(`📊 记忆报告已导出: ${reportFile}`);
                        return reportFile;
                    } catch (error) {
                        console.error('导出报告失败:', error);
                        this.stats.errors++;
                        return null;
                    }
                }
            };
            
            console.log('✅ JavaScript 记忆管理器初始化成功');
            return true;
            
        } catch (error) {
            console.error('JavaScript 记忆管理器初始化失败:', error);
            return false;
        }
    }

    /**
     * 加载记忆数据
     */
    async _loadMemoryData(memoryData) {
        try {
            const dataFile = path.join(this.config.memoryDir, 'memory_data.json');
            const exists = await fs.access(dataFile).then(() => true).catch(() => false);
            
            if (exists) {
                const content = await fs.readFile(dataFile, 'utf8');
                const savedData = JSON.parse(content);
                
                // 合并数据
                Object.assign(memoryData.marketData, savedData.marketData || {});
                memoryData.signals = savedData.signals || [];
                memoryData.trades = savedData.trades || [];
                memoryData.userPreferences = savedData.userPreferences || {};
                memoryData.conversations = savedData.conversations || [];
                
                console.log(`📂 已加载记忆数据: ${memoryData.signals.length} 信号, ${memoryData.trades.length} 交易`);
            }
        } catch (error) {
            console.error('加载记忆数据失败:', error);
        }
    }

    /**
     * 保存记忆数据
     */
    async _saveMemoryData(memoryData) {
        try {
            const dataFile = path.join(this.config.memoryDir, 'memory_data.json');
            await fs.writeFile(dataFile, JSON.stringify(memoryData, null, 2));
        } catch (error) {
            console.error('保存记忆数据失败:', error);
        }
    }

    /**
     * 清理过期数据
     */
    _cleanExpiredData(dataMap) {
        const now = Date.now();
        const expiredKeys = [];
        
        for (const [key, entry] of Object.entries(dataMap)) {
            if (entry.expiresAt && entry.expiresAt <= now) {
                expiredKeys.push(key);
            }
        }
        
        for (const key of expiredKeys) {
            delete dataMap[key];
        }
        
        if (expiredKeys.length > 0) {
            console.log(`🧹 清理了 ${expiredKeys.length} 个过期数据条目`);
        }
    }

    /**
     * 加载用户偏好
     */
    async loadUserPreferences() {
        try {
            if (!this.memoryManager) return {};
            
            const prefs = await this.memoryManager.getUserPreferences();
            console.log('👤 加载用户偏好:', Object.keys(prefs).length, '项');
            
            // 设置默认偏好（如果不存在）
            const defaultPrefs = {
                preferred_chain: 'Solana',
                risk_tolerance: 'medium',
                trading_style: 'needle_recovery',
                max_position_size: 0.1,
                stop_loss_percent: 0.05
            };
            
            for (const [key, value] of Object.entries(defaultPrefs)) {
                if (!prefs[key]) {
                    await this.memoryManager.storeUserPreference(key, value);
                    console.log(`  设置默认偏好: ${key} = ${value}`);
                }
            }
            
            return prefs;
        } catch (error) {
            console.error('加载用户偏好失败:', error);
            return {};
        }
    }

    /**
     * 存储市场数据
     */
    async storeMarketData(token, data) {
        if (!this.isInitialized || !this.memoryManager) {
            console.warn('记忆系统未初始化，跳过存储市场数据');
            return false;
        }
        
        return await this.memoryManager.storeMarketData(token, data);
    }

    /**
     * 存储交易信号
     */
    async storeSignal(signal) {
        if (!this.isInitialized || !this.memoryManager) {
            console.warn('记忆系统未初始化，跳过存储信号');
            return false;
        }
        
        // 确保信号有ID和时间戳
        const enhancedSignal = {
            id: signal.id || `sig_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            timestamp: new Date().toISOString(),
            ...signal
        };
        
        return await this.memoryManager.storeSignal(enhancedSignal);
    }

    /**
     * 存储交易记录
     */
    async storeTrade(trade) {
        if (!this.isInitialized || !this.memoryManager) {
            console.warn('记忆系统未初始化，跳过存储交易');
            return false;
        }
        
        // 添加到交易列表
        const enhancedTrade = {
            id: trade.id || `trade_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            timestamp: new Date().toISOString(),
            storedAt: Date.now(),
            ...trade
        };
        
        // 如果是JavaScript管理器，直接存储
        if (this.memoryManager.type === 'javascript') {
            this.memoryManager.data.trades.push(enhancedTrade);
            
            // 限制交易数量
            if (this.memoryManager.data.trades.length > 50) {
                this.memoryManager.data.trades = this.memoryManager.data.trades.slice(-50);
            }
            
            await this._saveMemoryData(this.memoryManager.data);
            this.stats.tradesStored++;
            return true;
        }
        
        // 对于Python管理器，使用storeSignal方法
        return await this.memoryManager.storeSignal(enhancedTrade);
    }

    /**
     * 查找相似交易
     */
    async findSimilarTrades(currentTrade, limit = 3) {
        if (!this.isInitialized || !this.memoryManager) {
            console.warn('记忆系统未初始化，返回空相似交易列表');
            return [];
        }
        
        return await this.memoryManager.findSimilarTrades(currentTrade, limit);
    }

    /**
     * 更新用户偏好
     */
    async updateUserPreference(preference, value) {
        if (!this.isInitialized || !this.memoryManager) {
            console.warn('记忆系统未初始化，跳过更新偏好');
            return false;
        }
        
        return await this.memoryManager.storeUserPreference(preference, value);
    }

    /**
     * 获取记忆统计
     */
    getStats() {
        return {
            ...this.stats,
            isInitialized: this.isInitialized,
            memoryType: this.memoryManager?.type || 'none',
            userId: this.userId,
            config: {
                memoryDir: this.config.memoryDir,
                ...this.config
            }
        };
    }

    /**
     * 导出记忆报告
     */
    async exportReport() {
        if (!this.isInitialized || !this.memoryManager) {
            console.warn('记忆系统未初始化，无法导出报告');
            return null;
        }
        
        return await this.memoryManager.exportReport();
    }

    /**
     * 清理资源
     */
    async cleanup() {
        console.log('🧹 清理记忆系统资源...');
        
        // 导出最终报告
        await this.exportReport();
        
        // 打印统计
        const stats = this.getStats();
        console.log('📊 记忆系统最终统计:');
        console.log(`  市场数据存储: ${stats.marketDataStored}`);
        console.log(`  信号存储: ${stats.signalsStored}`);
        console.log(`  交易存储: ${stats.tradesStored}`);
        console.log(`  查询次数: ${stats.queriesPerformed}`);
        console.log(`  相似交易找到: ${stats.similarTradesFound}`);
        console.log(`  错误数: ${stats.errors}`);
        console.log(`  记忆类型: ${stats.memoryType}`);
        
        this.isInitialized = false;
        this.memoryManager = null;
    }
}

module.exports = MemoryIntegration;