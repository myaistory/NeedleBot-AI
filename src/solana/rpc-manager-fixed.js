const { Connection, PublicKey, Transaction, VersionedTransaction } = require('@solana/web3.js');
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

class RPCNodeManager {
    constructor(configPath = './config/solana-rpc-config.json') {
        this.configPath = configPath;
        this.nodes = [];
        this.currentNode = null;
        this.connections = new Map();
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            totalLatency: 0,
            nodeSwitches: 0,
            lastSwitchTime: null
        };
        
        this.healthCheckInterval = null;
        this.initialized = false;
        this.isStopping = false;
        this.healthCheckActive = false; // 新增：跟踪健康检查状态
    }
    
    /**
     * 初始化 RPC 管理器
     */
    async initialize() {
        try {
            // 加载配置
            await this.loadConfig();
            
            // 验证节点连接
            await this.validateNodes();
            
            // 选择初始节点
            this.currentNode = await this.selectOptimalNode();
            
            // 启动健康检查
            this.startHealthMonitoring();
            
            this.initialized = true;
            logger.info(`RPC 管理器初始化完成，当前节点: ${this.currentNode.name}`);
            
            return true;
            
        } catch (error) {
            logger.error('RPC 管理器初始化失败:', error);
            throw error;
        }
    }
    
    /**
     * 加载配置文件
     */
    async loadConfig() {
        try {
            const configData = await fs.readFile(this.configPath, 'utf-8');
            const config = JSON.parse(configData);
            
            this.nodes = config.nodes.map(node => ({
                ...node,
                isHealthy: true,
                consecutiveFailures: 0,
                successRate: 1.0,
                lastResponseTime: 0,
                lastCheck: 0
            }));
            
            this.selectionConfig = config.selection || {
                maxRetries: 3,
                retryDelayMs: 100,
                healthCheckIntervalMs: 30000,
                maxResponseTime: 2000
            };
            
            this.healthConfig = config.healthCheck || {
                intervalMs: 30000,
                maxResponseTime: 2000,
                maxConsecutiveFailures: 3
            };
            
            logger.info(`加载 ${this.nodes.length} 个 RPC 节点配置`);
            
        } catch (error) {
            logger.error('加载 RPC 配置失败:', error);
            throw error;
        }
    }
    
    /**
     * 验证节点连接
     */
    async validateNodes() {
        const validationPromises = this.nodes.map(async (node) => {
            try {
                const connection = new Connection(node.url, {
                    commitment: 'confirmed',
                    wsEndpoint: node.wsUrl,
                    disableRetryOnRateLimit: false
                });
                
                this.connections.set(node.name, connection);
                
                // 测试连接
                const startTime = Date.now();
                const slot = await connection.getSlot();
                const latency = Date.now() - startTime;
                
                node.lastResponseTime = latency;
                node.isHealthy = true;
                
                logger.info(`节点 ${node.name} 验证成功，延迟: ${latency}ms`);
                
            } catch (error) {
                logger.error(`节点 ${node.name} 验证失败:`, error.message);
                node.isHealthy = false;
            }
        });
        
        await Promise.allSettled(validationPromises);
        
        const healthyNodes = this.nodes.filter(node => node.isHealthy).length;
        logger.info(`节点验证完成，${healthyNodes}/${this.nodes.length} 个节点健康`);
    }
    
    /**
     * 选择最优节点
     */
    async selectOptimalNode() {
        const healthyNodes = this.nodes.filter(node => node.isHealthy);
        
        if (healthyNodes.length === 0) {
            throw new Error('没有健康的 RPC 节点可用');
        }
        
        // 按权重和延迟选择
        const sortedNodes = healthyNodes.sort((a, b) => {
            const scoreA = (a.weight || 1) * (1 / (a.lastResponseTime || 1));
            const scoreB = (b.weight || 1) * (1 / (b.lastResponseTime || 1));
            return scoreB - scoreA;
        });
        
        return sortedNodes[0];
    }
    
    /**
     * 启动健康监控
     */
    startHealthMonitoring() {
        const intervalMs = this.healthConfig?.intervalMs || 30000;
        
        // 清除现有定时器
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        
        this.healthCheckInterval = setInterval(async () => {
            // 如果正在停止，跳过健康检查
            if (this.isStopping) {
                logger.debug('管理器正在停止，跳过健康检查');
                return;
            }
            
            // 防止并发健康检查
            if (this.healthCheckActive) {
                logger.debug('健康检查正在进行中，跳过');
                return;
            }
            
            this.healthCheckActive = true;
            try {
                await this.performHealthChecks();
            } catch (error) {
                logger.error('健康检查执行失败:', error);
            } finally {
                this.healthCheckActive = false;
            }
        }, intervalMs);
        
        logger.info(`启动 RPC 节点健康监控，间隔: ${intervalMs}ms`);
    }
    
    /**
     * 执行健康检查
     */
    async performHealthChecks() {
        // 如果正在停止，跳过健康检查
        if (this.isStopping) {
            logger.debug('管理器正在停止，跳过健康检查');
            return;
        }
        
        const checkPromises = this.nodes.map(async (node) => {
            try {
                const connection = this.connections.get(node.name);
                if (!connection) {
                    logger.warn(`节点 ${node.name} 连接不存在，跳过健康检查`);
                    return;
                }
                
                const startTime = Date.now();
                const slot = await connection.getSlot();
                const latency = Date.now() - startTime;
                
                // 更新节点状态
                node.lastResponseTime = latency;
                node.successRate = node.successRate * 0.9 + 0.1;
                node.consecutiveFailures = 0;
                node.lastCheck = Date.now();
                
                // 检查是否恢复健康
                if (!node.isHealthy && node.consecutiveFailures === 0) {
                    node.isHealthy = true;
                    logger.info(`节点 ${node.name} 恢复健康，延迟: ${latency}ms`);
                }
                
                // 检查性能阈值
                if (latency > (this.healthConfig?.maxResponseTime || 2000)) {
                    logger.warn(`节点 ${node.name} 延迟过高: ${latency}ms`);
                }
                
                logger.debug(`节点 ${node.name} 健康检查成功，延迟: ${latency}ms，成功率: ${(node.successRate * 100).toFixed(1)}%`);
                
            } catch (error) {
                // 如果正在停止，忽略错误
                if (this.isStopping) {
                    logger.debug(`忽略停止过程中的健康检查错误: ${error.message}`);
                    return;
                }
                
                logger.error(`节点 ${node.name} 健康检查失败:`, error.message);
                
                node.consecutiveFailures++;
                node.successRate = node.successRate * 0.9;
                
                if (node.consecutiveFailures >= (this.healthConfig?.maxConsecutiveFailures || 3)) {
                    node.isHealthy = false;
                    logger.error(`节点 ${node.name} 标记为不健康，连续失败: ${node.consecutiveFailures} 次`);
                }
            }
        });
        
        await Promise.allSettled(checkPromises);
        
        // 记录监控指标
        this.logMetrics();
    }
    
    /**
     * 记录性能指标
     */
    logMetrics() {
        const healthyNodes = this.nodes.filter(node => node.isHealthy).length;
        const totalNodes = this.nodes.length;
        const successRate = this.metrics.totalRequests > 0 
            ? (this.metrics.successfulRequests / this.metrics.totalRequests * 100).toFixed(2)
            : 0;
        const avgLatency = this.metrics.successfulRequests > 0
            ? (this.metrics.totalLatency / this.metrics.successfulRequests).toFixed(2)
            : 0;
        
        logger.debug(`RPC 监控指标 - 健康节点: ${healthyNodes}/${totalNodes}, 成功率: ${successRate}%, 平均延迟: ${avgLatency}ms, 切换次数: ${this.metrics.nodeSwitches}`);
    }
    
    /**
     * 获取当前连接
     */
    getConnection() {
        if (!this.currentNode) {
            throw new Error('没有可用的 RPC 节点');
        }
        
        const connection = this.connections.get(this.currentNode.name);
        if (!connection) {
            throw new Error(`节点 ${this.currentNode.name} 连接不存在`);
        }
        
        return connection;
    }
    
    /**
     * 获取网络状态
     */
    async getNetworkStatus() {
        try {
            const startTime = Date.now();
            const connection = this.getConnection();
            
            const [version, slot, tps] = await Promise.all([
                connection.getVersion(),
                connection.getSlot(),
                connection.getRecentPerformanceSamples(1)
            ]);
            
            const latency = Date.now() - startTime;
            
            // 更新指标
            this.updateNodeMetrics(this.currentNode.name, true, latency);
            
            return {
                success: true,
                data: {
                    version: version['solana-core'],
                    currentSlot: slot,
                    tps: tps.length > 0 ? Math.round(tps[0].numTransactions / tps[0].samplePeriodSecs) : 0,
                    latency
                },
                node: this.currentNode.name
            };
            
        } catch (error) {
            logger.error('获取网络状态失败:', error);
            
            // 更新指标
            this.updateNodeMetrics(this.currentNode.name, false);
            
            return {
                success: false,
                error: error.message,
                node: this.currentNode.name
            };
        }
    }
    
    /**
     * 获取账户信息
     */
    async getAccountInfo(publicKey, commitment = 'confirmed') {
        try {
            const startTime = Date.now();
            const connection = this.getConnection();
            const pubkey = new PublicKey(publicKey);
            
            const accountInfo = await connection.getAccountInfo(pubkey, commitment);
            const latency = Date.now() - startTime;
            
            this.updateNodeMetrics(this.currentNode.name, true, latency);
            
            return {
                success: true,
                data: accountInfo,
                latency,
                node: this.currentNode.name
            };
            
        } catch (error) {
            logger.error('获取账户信息失败:', error);
            
            this.updateNodeMetrics(this.currentNode.name, false);
            
            return {
                success: false,
                error: error.message,
                node: this.currentNode.name
            };
        }
    }
    
    /**
     * 更新节点性能指标
     */
    updateNodeMetrics(nodeName, success, latency = 0) {
        this.metrics.totalRequests++;
        
        if (success) {
            this.metrics.successfulRequests++;
            this.metrics.totalLatency += latency;
            
            // 更新节点成功率
            const node = this.nodes.find(n => n.name === nodeName);
            if (node) {
                node.successRate = node.successRate * 0.9 + 0.1;
                node.lastResponseTime = latency;
                node.consecutiveFailures = 0;
            }
        } else {
            this.metrics.failedRequests++;
            
            // 更新节点失败计数
            const node = this.nodes.find(n => n.name === nodeName);
            if (node) {
                node.consecutiveFailures++;
                node.successRate = node.successRate * 0.9;
                
                if (node.consecutiveFailures >= (this.healthConfig?.maxConsecutiveFailures || 3)) {
                    node.isHealthy = false;
                    logger.error(`节点 ${node.name} 因连续失败标记为不健康`);
                }
            }
        }
    }
    
    /**
     * 切换到备用节点
     */
    async switchToBackupNode() {
        try {
            const oldNode = this.currentNode;
            this.currentNode = await this.selectOptimalNode();
            
            if (oldNode.name !== this.currentNode.name) {
                this.metrics.nodeSwitches++;
                this.metrics.lastSwitchTime = Date.now();
                logger.info(`切换到备用节点: ${oldNode.name} → ${this.currentNode.name}`);
            }
            
            return this.currentNode;
            
        } catch (error) {
            logger.error('切换到备用节点失败:', error);
            throw error;
        }
    }
    
    /**
     * 获取性能报告
     */
    getPerformanceReport() {
        const healthyNodes = this.nodes.filter(node => node.isHealthy);
        const unhealthyNodes = this.nodes.filter(node => !node.isHealthy);
        
        const report = {
            timestamp: new Date().toISOString(),
            initialization: this.initialized ? '成功' : '失败',
            nodeCount: this.nodes.length,
            healthyNodes: healthyNodes.length,
            unhealthyNodes: unhealthyNodes.length,
            currentNode: this.currentNode?.name || '无',
            metrics: { ...this.metrics },
            nodes: this.nodes.map(node => ({
                name: node.name,
                type: node.type,
                isHealthy: node.isHealthy,
                successRate: (node.successRate * 100).toFixed(1),
                lastResponseTime: node.lastResponseTime,
                consecutiveFailures: node.consecutiveFailures,
                lastCheck: new Date(node.lastCheck).toISOString()
            })),
            suggestions: []
        };
        
        // 添加优化建议
        if (healthyNodes.length === 0) {
            report.suggestions.push('🚨 没有健康的节点可用，检查网络连接或节点配置');
        }
        
        unhealthyNodes.forEach(node => {
            report.suggestions.push(`⚠️ 节点 ${node.name} 不健康，成功率: ${(node.successRate * 100).toFixed(1)}%`);
        });
        
        if (this.metrics.successRate < 80) {
            report.suggestions.push('📉 整体成功率过低，考虑优化节点配置或增加重试机制');
        }
        
        return report;
    }
    
    /**
     * 停止 RPC 管理器
     */
    async stop() {
        logger.debug('开始停止 RPC 管理器');
        this.isStopping = true;
        
        // 停止健康检查
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
            logger.debug('健康检查已停止');
        }
        
        // 等待任何正在进行的健康检查完成
        if (this.healthCheckActive) {
            logger.debug('等待正在进行的健康检查完成...');
            await new Promise(resolve => {
                const checkInterval = setInterval(() => {
                    if (!this.healthCheckActive) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 50);
                
                // 超时保护
                setTimeout(() => {
                    clearInterval(checkInterval);
                    logger.warn('健康检查等待超时，强制停止');
                    resolve();
                }, 1000);
            });
        }
        
        // 重置所有节点状态
        for (const node of this.nodes) {
            node.consecutiveFailures = 0;
            node.isHealthy = true;
            node.lastCheck = Date.now();
        }
        
        // 关闭所有连接
        this.connections.forEach((connection, name) => {
            try {
                logger.debug(`关闭节点 ${name} 的连接`);
            } catch (error) {
                logger.error(`关闭节点 ${name} 连接失败:`, error);
            }
        });
        
        this.connections.clear();
        this.initialized = false;
        this.isStopping = false;
        
        logger.info('RPC 管理器已停止');
    }
    
    /**
     * 延迟函数
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = RPCNodeManager;