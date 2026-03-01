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
        this.isStopping = false; // 添加停止标志
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
            const configData = await fs.readFile(this.configPath, 'utf8');
            const config = JSON.parse(configData);
            
            this.nodes = config.nodes.map(node => ({
                ...node,
                lastResponseTime: node.lastResponseTime || 0,
                successRate: node.successRate || 1.0,
                consecutiveFailures: 0,
                lastCheck: 0,
                isHealthy: true
            }));
            
            this.healthConfig = config.healthCheck;
            this.selectionConfig = config.selection;
            this.monitoringConfig = config.monitoring;
            this.featuresConfig = config.features;
            
            logger.info(`加载了 ${this.nodes.length} 个 RPC 节点配置`);
            
        } catch (error) {
            logger.error('加载 RPC 配置失败:', error);
            
            // 使用默认配置
            this.nodes = [
                {
                    name: 'quicknode-premium',
                    url: 'https://solana-mainnet.quicknode.com/QN_96c3e3c8026243a2ab3f2ac94ec5efdd',
                    weight: 40,
                    type: 'premium',
                    provider: 'quicknode',
                    lastResponseTime: 0,
                    successRate: 1.0,
                    consecutiveFailures: 0,
                    lastCheck: 0,
                    isHealthy: true
                },
                {
                    name: 'triton-public',
                    url: 'https://api.mainnet-beta.solana.com',
                    weight: 20,
                    type: 'public',
                    provider: 'solana',
                    lastResponseTime: 0,
                    successRate: 0.8,
                    consecutiveFailures: 0,
                    lastCheck: 0,
                    isHealthy: true
                }
            ];
            
            logger.warn('使用默认 RPC 节点配置');
        }
    }
    
    /**
     * 验证节点连接
     */
    async validateNodes() {
        const validationPromises = this.nodes.map(async (node) => {
            try {
                const startTime = Date.now();
                const connection = new Connection(node.url, {
                    commitment: 'confirmed',
                    wsEndpoint: node.url.replace('https://', 'wss://')
                });
                
                // 测试连接
                const slot = await connection.getSlot();
                const latency = Date.now() - startTime;
                
                node.lastResponseTime = latency;
                node.successRate = 1.0;
                node.isHealthy = true;
                this.connections.set(node.name, connection);
                
                logger.info(`节点 ${node.name} 验证成功，延迟: ${latency}ms，当前 slot: ${slot}`);
                return { node, success: true, latency };
                
            } catch (error) {
                logger.error(`节点 ${node.name} 验证失败:`, error.message);
                node.isHealthy = false;
                node.successRate = 0;
                return { node, success: false, error: error.message };
            }
        });
        
        const results = await Promise.allSettled(validationPromises);
        
        // 统计健康节点
        const healthyNodes = this.nodes.filter(node => node.isHealthy);
        if (healthyNodes.length === 0) {
            throw new Error('所有 RPC 节点连接失败');
        }
        
        logger.info(`RPC 节点验证完成，${healthyNodes.length}/${this.nodes.length} 个节点健康`);
    }
    
    /**
     * 选择最优节点
     */
    async selectOptimalNode() {
        const healthyNodes = this.nodes.filter(node => 
            node.isHealthy && 
            node.successRate >= (this.healthConfig?.minSuccessRate || 0.7)
        );
        
        if (healthyNodes.length === 0) {
            throw new Error('没有健康的 RPC 节点可用');
        }
        
        // 加权随机选择
        if (this.selectionConfig?.strategy === 'weighted-random') {
            const totalWeight = healthyNodes.reduce((sum, node) => sum + node.weight, 0);
            let random = Math.random() * totalWeight;
            
            for (const node of healthyNodes) {
                random -= node.weight;
                if (random <= 0) {
                    return node;
                }
            }
        }
        
        // 默认选择成功率最高的节点
        return healthyNodes.sort((a, b) => b.successRate - a.successRate)[0];
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
            throw new Error(`节点 ${this.currentNode.name} 的连接未初始化`);
        }
        
        return connection;
    }
    
    /**
     * 发送交易（带重试和故障转移）
     */
    async sendTransactionWithRetry(transaction, options = {}) {
        const {
            maxRetries = this.selectionConfig?.maxRetries || 3,
            retryDelayMs = this.selectionConfig?.retryDelayMs || 100,
            skipPreflight = false,
            preflightCommitment = 'confirmed'
        } = options;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const startTime = Date.now();
                const connection = this.getConnection();
                
                let signature;
                if (transaction instanceof VersionedTransaction) {
                    signature = await connection.sendTransaction(transaction, {
                        skipPreflight,
                        preflightCommitment,
                        maxRetries: 0
                    });
                } else {
                    signature = await connection.sendTransaction(transaction, [], {
                        skipPreflight,
                        preflightCommitment,
                        maxRetries: 0
                    });
                }
                
                const latency = Date.now() - startTime;
                
                // 更新节点性能指标
                this.updateNodeMetrics(this.currentNode.name, true, latency);
                
                logger.info(`交易发送成功 (尝试 ${attempt})，签名: ${signature}，延迟: ${latency}ms`);
                
                return {
                    success: true,
                    signature,
                    node: this.currentNode.name,
                    attempt,
                    latency
                };
                
            } catch (error) {
                logger.error(`交易发送失败 (尝试 ${attempt}):`, error.message);
                
                // 更新节点性能指标
                this.updateNodeMetrics(this.currentNode.name, false);
                
                if (attempt === maxRetries) {
                    return {
                        success: false,
                        error: error.message,
                        node: this.currentNode.name,
                        attempt
                    };
                }
                
                // 切换到备用节点
                await this.switchToBackupNode();
                
                // 指数退避延迟
                await this.delay(Math.pow(2, attempt) * retryDelayMs);
            }
        }
        
        return {
            success: false,
            error: '所有重试尝试均失败',
            node: this.currentNode.name,
            attempt: maxRetries
        };
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
            logger.error('获取账户信息失败:', error.message);
            this.updateNodeMetrics(this.currentNode.name, false);
            
            // 尝试切换到备用节点重试
            await this.switchToBackupNode();
            
            throw error;
        }
    }
    
    /**
     * 获取交易状态
     */
    async getTransactionStatus(signature, commitment = 'confirmed') {
        try {
            const startTime = Date.now();
            const connection = this.getConnection();
            
            const status = await connection.getSignatureStatus(signature, {
                searchTransactionHistory: true
            });
            
            const latency = Date.now() - startTime;
            this.updateNodeMetrics(this.currentNode.name, true, latency);
            
            return {
                success: true,
                status,
                latency,
                node: this.currentNode.name
            };
            
        } catch (error) {
            logger.error('获取交易状态失败:', error.message);
            this.updateNodeMetrics(this.currentNode.name, false);
            
            throw error;
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
                
                logger.warn(`RPC 节点切换: ${oldNode.name} → ${this.currentNode.name}`);
            }
            
        } catch (error) {
            logger.error('切换到备用节点失败:', error);
            throw error;
        }
    }
    
    /**
     * 更新节点性能指标
     */
    updateNodeMetrics(nodeName, success, latency = 0) {
        const node = this.nodes.find(n => n.name === nodeName);
        if (!node) return;
        
        this.metrics.totalRequests++;
        
        if (success) {
            this.metrics.successfulRequests++;
            this.metrics.totalLatency += latency;
            
            // 平滑更新成功率
            node.successRate = node.successRate * 0.9 + 0.1;
            node.consecutiveFailures = 0;
            node.lastResponseTime = latency;
            node.lastCheck = Date.now();
            
        } else {
            this.metrics.failedRequests++;
            node.consecutiveFailures++;
            
            // 降低成功率
            node.successRate = node.successRate * 0.9;
            
            // 检查是否需要标记为不健康
            if (node.consecutiveFailures >= (this.monitoringConfig?.alertThresholds?.consecutiveFailures || 3)) {
                node.isHealthy = false;
                logger.error(`节点 ${nodeName} 标记为不健康，连续失败: ${node.consecutiveFailures} 次`);
            }
        }
    }
    
    /**
     * 启动健康监控
     */
    startHealthMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        
        const intervalMs = this.healthConfig?.intervalMs || 30000;
        
        this.healthCheckInterval = setInterval(async () => {
            try {
                await this.performHealthChecks();
            } catch (error) {
                logger.error('健康检查执行失败:', error);
            }
        }, intervalMs);
        
        logger.info(`启动 RPC 节点健康监控，间隔: ${intervalMs}ms`);
    }
    
    /**
     * 执行健康检查
     */
    async performHealthChecks() {
        // 检查是否正在停止或未初始化
        if (this.isStopping || !this.initialized) {
            logger.debug('系统正在停止或未初始化，跳过健康检查');
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
                // 检查是否正在停止，如果是则跳过标记
                if (this.isStopping) {
                    logger.debug(`系统正在停止，跳过节点 ${node.name} 的健康检查失败`);
                    return;
                }
                
                logger.error(`节点 ${node.name} 健康检查失败:`, error.message);
                
                node.consecutiveFailures++;
                node.successRate = node.successRate * 0.9;
                
                if (node.consecutiveFailures >= 3) {
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
     * 获取性能报告
     */
    getPerformanceReport() {
        const healthyNodes = this.nodes.filter(node => node.isHealthy);
        const unhealthyNodes = this.nodes.filter(node => !node.isHealthy);
        
        return {
            timestamp: Date.now(),
            metrics: { ...this.metrics },
            currentNode: this.currentNode ? {
                name: this.currentNode.name,
                url: this.currentNode.url,
                successRate: this.currentNode.successRate,
                lastResponseTime: this.currentNode.lastResponseTime
            } : null,
            nodeStatus: {
                total: this.nodes.length,
                healthy: healthyNodes.length,
                unhealthy: unhealthyNodes.length,
                healthyNodes: healthyNodes.map(node => ({
                    name: node.name,
                    type: node.type,
                    successRate: node.successRate,
                    lastResponseTime: node.lastResponseTime,
                    weight: node.weight
                })),
                unhealthyNodes: unhealthyNodes.map(node => ({
                    name: node.name,
                    type: node.type,
                    successRate: node.successRate,
                    consecutiveFailures: node.consecutiveFailures,
                    lastCheck: node.lastCheck
                }))
            },
            recommendations: this.generateRecommendations()
        };
    }
    
    /**
     * 生成优化建议
     */
    generateRecommendations() {
        const recommendations = [];
        
        // 检查节点性能
        this.nodes.forEach(node => {
            if (node.successRate < 0.7) {
                recommendations.push({
                    type: 'warning',
                    message: `节点 ${node.name} 成功率过低: ${(node.successRate * 100).toFixed(1)}%`,
                    suggestion: '考虑更换节点或检查网络连接'
                });
            }
            
            if (node.lastResponseTime > 2000) {
                recommendations.push({
                    type: 'warning',
                    message: `节点 ${node.name} 延迟过高: ${node.lastResponseTime}ms`,
                    suggestion: '考虑使用更近的节点或优化网络'
                });
            }
        });
        
        // 检查切换频率
        if (this.metrics.nodeSwitches > 10) {
            recommendations.push({
                type: 'critical',
                message: `节点切换过于频繁: ${this.metrics.nodeSwitches} 次`,
                suggestion: '检查节点稳定性或调整健康检查参数'
            });
        }
        
        // 检查整体成功率
        const overallSuccessRate = this.metrics.totalRequests > 0 
            ? this.metrics.successfulRequests / this.metrics.totalRequests 
            : 1;
            
        if (overallSuccessRate < 0.8) {
            recommendations.push({
                type: 'critical',
                message: `整体成功率过低: ${(overallSuccessRate * 100).toFixed(1)}%`,
                suggestion: '检查所有节点配置和网络环境'
            });
        }
        
        return recommendations;
    }
    
    /**
     * 停止管理器
     */
    async stop() {
        // 设置停止标志，防止健康检查在停止过程中标记节点
        this.isStopping = true;
        
        // 立即重置所有节点状态，避免在停止过程中被标记
        for (const node of this.nodes) {
            node.consecutiveFailures = 0;
            node.isHealthy = true;
            node.lastCheck = Date.now();
        }
        
        // 首先停止健康检查并等待任何正在进行的检查完成
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
            logger.debug('健康检查已停止');
            
            // 等待更长时间确保健康检查循环完全结束
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // 重置所有节点状态，避免在停止时标记为不健康
        for (const node of this.nodes) {
            node.consecutiveFailures = 0;
            node.isHealthy = true;
            node.lastCheck = Date.now();
        }
        
        // 关闭所有连接
        this.connections.forEach((connection, name) => {
            try {
                // Web3.js Connection 没有显式的关闭方法
                logger.debug(`关闭节点 ${name} 的连接`);
            } catch (error) {
                logger.error(`关闭节点 ${name} 连接失败:`, error);
            }
        });
        
        this.connections.clear();
        this.initialized = false;
        
        logger.info('RPC 管理器已停止');
    }
    
    /**
     * 延迟函数
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * 获取网络状态
     */
    async getNetworkStatus() {
        try {
            const connection = this.getConnection();
            const startTime = Date.now();
            
            const [version, slot, epochInfo] = await Promise.all([
                connection.getVersion(),
                connection.getSlot(),
                connection.getEpochInfo()
            ]);
            
            const latency = Date.now() - startTime;
            
            // 获取性能样本
            let tps = 0;
            try {
                const samples = await connection.getRecentPerformanceSamples(1);
                if (samples.length > 0) {
                    tps = samples[0].numTransactions / samples[0].samplePeriodSecs;
                }
            } catch (error) {
                logger.warn('获取 TPS 数据失败:', error.message);
            }
            
            return {
                success: true,
                data: {
                    version: version['solana-core'],
                    currentSlot: slot,
                    epoch: epochInfo.epoch,
                    slotIndex: epochInfo.slotIndex,
                    slotsInEpoch: epochInfo.slotsInEpoch,
                    tps: Math.round(tps),
                    latency,
                    node: this.currentNode.name
                }
            };
            
        } catch (error) {
            logger.error('获取网络状态失败:', error);
            return {
                success: false,
                error: error.message,
                node: this.currentNode.name
            };
        }
    }
    
    /**
     * 获取节点统计信息
     */
    getNodeStats() {
        return this.nodes.map(node => ({
            name: node.name,
            type: node.type,
            provider: node.provider,
            isHealthy: node.isHealthy,
            successRate: node.successRate,
            lastResponseTime: node.lastResponseTime,
            consecutiveFailures: node.consecutiveFailures,
            weight: node.weight,
            lastCheck: node.lastCheck
        }));
    }
    
    /**
     * 手动切换节点
     */
    async switchNode(nodeName) {
        const targetNode = this.nodes.find(node => node.name === nodeName);
        
        if (!targetNode) {
            throw new Error(`节点 ${nodeName} 不存在`);
        }
        
        if (!targetNode.isHealthy) {
            throw new Error(`节点 ${nodeName} 不健康，无法切换`);
        }
        
        const oldNode = this.currentNode;
        this.currentNode = targetNode;
        
        this.metrics.nodeSwitches++;
        this.metrics.lastSwitchTime = Date.now();
        
        logger.info(`手动切换 RPC 节点: ${oldNode.name} → ${this.currentNode.name}`);
        
        return {
            success: true,
            from: oldNode.name,
            to: this.currentNode.name,
            timestamp: Date.now()
        };
    }
    
    /**
     * 添加新节点
     */
    async addNode(nodeConfig) {
        // 验证节点配置
        const requiredFields = ['name', 'url', 'type'];
        for (const field of requiredFields) {
            if (!nodeConfig[field]) {
                throw new Error(`节点配置缺少必需字段: ${field}`);
            }
        }
        
        // 检查是否已存在同名节点
        if (this.nodes.some(node => node.name === nodeConfig.name)) {
            throw new Error(`节点 ${nodeConfig.name} 已存在`);
        }
        
        // 验证节点连接
        try {
            const connection = new Connection(nodeConfig.url);
            await connection.getSlot();
            
            // 添加节点
            const newNode = {
                name: nodeConfig.name,
                url: nodeConfig.url,
                type: nodeConfig.type,
                provider: nodeConfig.provider || 'custom',
                weight: nodeConfig.weight || 10,
                lastResponseTime: 0,
                successRate: 1.0,
                consecutiveFailures: 0,
                lastCheck: Date.now(),
                isHealthy: true,
                features: nodeConfig.features || []
            };
            
            this.nodes.push(newNode);
            this.connections.set(newNode.name, connection);
            
            logger.info(`添加新节点: ${newNode.name} (${newNode.url})`);
            
            return {
                success: true,
                node: newNode
            };
            
        } catch (error) {
            throw new Error(`节点验证失败: ${error.message}`);
        }
    }
    
    /**
     * 移除节点
     */
    async removeNode(nodeName) {
        const nodeIndex = this.nodes.findIndex(node => node.name === nodeName);
        
        if (nodeIndex === -1) {
            throw new Error(`节点 ${nodeName} 不存在`);
        }
        
        // 检查是否为当前节点
        if (this.currentNode && this.currentNode.name === nodeName) {
            throw new Error(`无法移除当前正在使用的节点: ${nodeName}`);
        }
        
        // 移除节点
        const removedNode = this.nodes.splice(nodeIndex, 1)[0];
        
        // 关闭连接
        const connection = this.connections.get(nodeName);
        if (connection) {
            this.connections.delete(nodeName);
        }
        
        logger.info(`移除节点: ${nodeName}`);
        
        return {
            success: true,
            node: removedNode
        };
    }
}

module.exports = RPCNodeManager;
