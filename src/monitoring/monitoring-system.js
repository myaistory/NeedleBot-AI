/**
 * NeedleBot AI 监控和告警系统
 * 提供系统健康监控、性能指标和告警功能
 */

const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

class MonitoringSystem {
    constructor(config = {}) {
        this.config = {
            checkInterval: 30000, // 30秒检查一次
            alertThresholds: {
                apiErrorRate: 0.1, // 10% API错误率
                memoryUsage: 0.8,  // 80%内存使用率
                cpuUsage: 0.7,     // 70% CPU使用率
                diskUsage: 0.9,    // 90%磁盘使用率
                responseTime: 5000, // 5秒响应时间
                tradeFailureRate: 0.2 // 20%交易失败率
            },
            alertChannels: ['log', 'file'], // log, file, email, webhook
            retentionDays: 7,
            ...config
        };

        this.metrics = {
            system: {
                startTime: Date.now(),
                uptime: 0,
                checks: 0,
                alerts: 0
            },
            api: {
                calls: 0,
                errors: 0,
                successRate: 1.0,
                avgResponseTime: 0,
                lastError: null
            },
            trading: {
                signals: 0,
                trades: 0,
                successes: 0,
                failures: 0,
                successRate: 1.0,
                totalProfit: 0,
                totalLoss: 0
            },
            resources: {
                memory: {
                    used: 0,
                    total: 0,
                    percentage: 0
                },
                cpu: {
                    usage: 0,
                    load: [0, 0, 0]
                },
                disk: {
                    used: 0,
                    total: 0,
                    percentage: 0
                }
            },
            lastCheck: null
        };

        this.alerts = [];
        this.isMonitoring = false;
        this.monitoringInterval = null;
        this.metricsFile = path.join(__dirname, '../../logs/metrics.json');
        this.alertsFile = path.join(__dirname, '../../logs/alerts.json');

        // 确保日志目录存在
        this.ensureLogDirectory();
    }

    /**
     * 确保日志目录存在
     */
    async ensureLogDirectory() {
        const logDir = path.join(__dirname, '../../logs');
        try {
            await fs.mkdir(logDir, { recursive: true });
        } catch (error) {
            logger.error('创建日志目录失败:', error.message);
        }
    }

    /**
     * 启动监控系统
     */
    start() {
        if (this.isMonitoring) {
            logger.warn('监控系统已经在运行中');
            return;
        }

        logger.info('🚀 启动监控系统...');
        this.isMonitoring = true;

        // 初始检查
        this.performCheck();

        // 定时检查
        this.monitoringInterval = setInterval(
            () => this.performCheck(),
            this.config.checkInterval
        );

        logger.info(`✅ 监控系统已启动，检查间隔: ${this.config.checkInterval}ms`);
    }

    /**
     * 停止监控系统
     */
    stop() {
        if (!this.isMonitoring) return;

        logger.info('🛑 停止监控系统...');
        this.isMonitoring = false;

        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        // 保存最终指标
        this.saveMetrics();
        this.saveAlerts();

        logger.info('✅ 监控系统已停止');
    }

    /**
     * 执行监控检查
     */
    async performCheck() {
        try {
            this.metrics.system.checks++;
            this.metrics.system.uptime = Date.now() - this.metrics.system.startTime;
            this.metrics.lastCheck = new Date().toISOString();

            // 收集系统资源指标
            await this.collectResourceMetrics();

            // 检查阈值并触发告警
            await this.checkThresholds();

            // 保存指标
            await this.saveMetrics();

            // 清理旧数据
            await this.cleanupOldData();

            logger.debug(`监控检查完成 #${this.metrics.system.checks}`);

        } catch (error) {
            logger.error('监控检查失败:', error.message);
        }
    }

    /**
     * 收集系统资源指标
     */
    async collectResourceMetrics() {
        try {
            // 内存使用 - 使用系统总内存而不是进程堆内存
            const os = require('os');
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;
            
            this.metrics.resources.memory.used = usedMem;
            this.metrics.resources.memory.total = totalMem;
            this.metrics.resources.memory.percentage = usedMem / totalMem;
            
            // 同时记录进程内存使用（用于调试）
            const processMemory = process.memoryUsage();
            this.metrics.resources.memory.processHeapUsed = processMemory.heapUsed;
            this.metrics.resources.memory.processHeapTotal = processMemory.heapTotal;
            this.metrics.resources.memory.processHeapPercentage = processMemory.heapUsed / processMemory.heapTotal;

            // CPU使用（简化版本）
            const startUsage = process.cpuUsage();
            await new Promise(resolve => setTimeout(resolve, 100));
            const endUsage = process.cpuUsage(startUsage);
            
            const totalCpuTime = endUsage.user + endUsage.system;
            this.metrics.resources.cpu.usage = totalCpuTime / 100000; // 简化计算

            // 系统负载（如果可用）
            if (require('os').loadavg) {
                this.metrics.resources.cpu.load = require('os').loadavg();
            }

            // 磁盘使用（简化版本）
            try {
                const stats = await fs.statfs('/');
                const total = stats.blocks * stats.bsize;
                const free = stats.bfree * stats.bsize;
                const used = total - free;
                
                this.metrics.resources.disk.total = total;
                this.metrics.resources.disk.used = used;
                this.metrics.resources.disk.percentage = used / total;
            } catch (error) {
                // 磁盘统计可能失败，使用默认值
                this.metrics.resources.disk.percentage = 0.5;
            }

        } catch (error) {
            logger.error('收集资源指标失败:', error.message);
        }
    }

    /**
     * 检查阈值并触发告警
     */
    async checkThresholds() {
        const thresholds = this.config.alertThresholds;
        const newAlerts = [];

        // 检查API错误率
        if (this.metrics.api.calls > 10) {
            const errorRate = this.metrics.api.errors / this.metrics.api.calls;
            if (errorRate > thresholds.apiErrorRate) {
                newAlerts.push({
                    type: 'api_error_rate',
                    level: 'warning',
                    message: `API错误率过高: ${(errorRate * 100).toFixed(1)}%`,
                    value: errorRate,
                    threshold: thresholds.apiErrorRate,
                    timestamp: new Date().toISOString()
                });
            }
        }

        // 检查内存使用
        if (this.metrics.resources.memory.percentage > thresholds.memoryUsage) {
            newAlerts.push({
                type: 'high_memory_usage',
                level: 'warning',
                message: `内存使用率过高: ${(this.metrics.resources.memory.percentage * 100).toFixed(1)}%`,
                value: this.metrics.resources.memory.percentage,
                threshold: thresholds.memoryUsage,
                timestamp: new Date().toISOString()
            });
        }

        // 检查CPU使用
        if (this.metrics.resources.cpu.usage > thresholds.cpuUsage) {
            newAlerts.push({
                type: 'high_cpu_usage',
                level: 'warning',
                message: `CPU使用率过高: ${(this.metrics.resources.cpu.usage * 100).toFixed(1)}%`,
                value: this.metrics.resources.cpu.usage,
                threshold: thresholds.cpuUsage,
                timestamp: new Date().toISOString()
            });
        }

        // 检查磁盘使用
        if (this.metrics.resources.disk.percentage > thresholds.diskUsage) {
            newAlerts.push({
                type: 'high_disk_usage',
                level: 'critical',
                message: `磁盘使用率过高: ${(this.metrics.resources.disk.percentage * 100).toFixed(1)}%`,
                value: this.metrics.resources.disk.percentage,
                threshold: thresholds.diskUsage,
                timestamp: new Date().toISOString()
            });
        }

        // 检查交易失败率
        if (this.metrics.trading.trades > 5) {
            const failureRate = this.metrics.trading.failures / this.metrics.trading.trades;
            if (failureRate > thresholds.tradeFailureRate) {
                newAlerts.push({
                    type: 'high_trade_failure',
                    level: 'critical',
                    message: `交易失败率过高: ${(failureRate * 100).toFixed(1)}%`,
                    value: failureRate,
                    threshold: thresholds.tradeFailureRate,
                    timestamp: new Date().toISOString()
                });
            }
        }

        // 处理新告警
        for (const alert of newAlerts) {
            await this.triggerAlert(alert);
        }
    }

    /**
     * 触发告警
     */
    async triggerAlert(alert) {
        this.metrics.system.alerts++;
        this.alerts.push(alert);

        // 记录告警
        logger[alert.level === 'critical' ? 'error' : 'warn'](`[告警] ${alert.message}`);

        // 根据配置的渠道发送告警
        for (const channel of this.config.alertChannels) {
            try {
                switch (channel) {
                    case 'log':
                        // 已经通过logger处理
                        break;
                        
                    case 'file':
                        await this.saveAlertToFile(alert);
                        break;
                        
                    case 'email':
                        await this.sendEmailAlert(alert);
                        break;
                        
                    case 'webhook':
                        await this.sendWebhookAlert(alert);
                        break;
                }
            } catch (error) {
                logger.error(`发送告警到渠道 ${channel} 失败:`, error.message);
            }
        }
    }

    /**
     * 保存告警到文件
     */
    async saveAlertToFile(alert) {
        try {
            let alertsData = [];
            
            // 读取现有告警
            try {
                const data = await fs.readFile(this.alertsFile, 'utf8');
                alertsData = JSON.parse(data);
            } catch (error) {
                // 文件不存在或解析错误，创建新数组
            }
            
            // 添加新告警
            alertsData.push(alert);
            
            // 只保留最近1000条告警
            if (alertsData.length > 1000) {
                alertsData = alertsData.slice(-1000);
            }
            
            // 保存到文件
            await fs.writeFile(this.alertsFile, JSON.stringify(alertsData, null, 2));
            
        } catch (error) {
            logger.error('保存告警到文件失败:', error.message);
        }
    }

    /**
     * 发送邮件告警（占位符）
     */
    async sendEmailAlert(alert) {
        // 需要实现邮件发送逻辑
        logger.debug(`[邮件告警] ${alert.message}`);
    }

    /**
     * 发送Webhook告警（占位符）
     */
    async sendWebhookAlert(alert) {
        // 需要实现Webhook发送逻辑
        logger.debug(`[Webhook告警] ${alert.message}`);
    }

    /**
     * 更新API指标
     */
    updateAPIMetrics(success, responseTime = 0, error = null) {
        this.metrics.api.calls++;
        
        if (success) {
            // 更新平均响应时间（移动平均）
            const alpha = 0.1; // 平滑因子
            this.metrics.api.avgResponseTime = 
                alpha * responseTime + (1 - alpha) * this.metrics.api.avgResponseTime;
        } else {
            this.metrics.api.errors++;
            this.metrics.api.lastError = {
                message: error?.message || 'Unknown error',
                timestamp: new Date().toISOString()
            };
        }
        
        // 计算成功率
        this.metrics.api.successRate = 
            (this.metrics.api.calls - this.metrics.api.errors) / Math.max(1, this.metrics.api.calls);
    }

    /**
     * 更新交易指标
     */
    updateTradingMetrics(signal = false, trade = false, success = false, profit = 0) {
        if (signal) {
            this.metrics.trading.signals++;
        }
        
        if (trade) {
            this.metrics.trading.trades++;
            
            if (success) {
                this.metrics.trading.successes++;
                this.metrics.trading.totalProfit += Math.max(0, profit);
            } else {
                this.metrics.trading.failures++;
                this.metrics.trading.totalLoss += Math.abs(Math.min(0, profit));
            }
            
            // 计算成功率
            this.metrics.trading.successRate = 
                this.metrics.trading.successes / Math.max(1, this.metrics.trading.trades);
        }
    }

    /**
     * 保存指标到文件
     */
    async saveMetrics() {
        try {
            const metricsData = {
                timestamp: new Date().toISOString(),
                metrics: this.metrics,
                summary: this.getSummary()
            };
            
            await fs.writeFile(this.metricsFile, JSON.stringify(metricsData, null, 2));
            
        } catch (error) {
            logger.error('保存指标失败:', error.message);
        }
    }

    /**
     * 保存告警到文件
     */
    async saveAlerts() {
        try {
            await fs.writeFile(this.alertsFile, JSON.stringify(this.alerts, null, 2));
        } catch (error) {
            logger.error('保存告警失败:', error.message);
        }
    }

    /**
     * 清理旧数据
     */
    async cleanupOldData() {
        try {
            const retentionMs = this.config.retentionDays * 24 * 60 * 60 * 1000;
            const cutoffTime = Date.now() - retentionMs;
            
            // 清理旧告警
            this.alerts = this.alerts.filter(alert => 
                new Date(alert.timestamp).getTime() > cutoffTime
            );
            
        } catch (error) {
            logger.error('清理旧数据失败:', error.message);
        }
    }

    /**
     * 获取监控摘要
     */
    getSummary() {
        const uptimeHours = (this.metrics.system.uptime / (1000 * 60 * 60)).toFixed(2);
        
        return {
            uptime: `${uptimeHours} 小时`,
            checks: this.metrics.system.checks,
            alerts: this.metrics.system.alerts,
            api: {
                calls: this.metrics.api.calls,
                successRate: `${(this.metrics.api.successRate * 100).toFixed(1)}%`,
                avgResponseTime: `${this.metrics.api.avgResponseTime.toFixed(0)}ms`
            },
            trading: {
                signals: this.metrics.trading.signals,
                trades: this.metrics.trading.trades,
                successRate: `${(this.metrics.trading.successRate * 100).toFixed(1)}%`,
                profit: `$${this.metrics.trading.totalProfit.toFixed(2)}`,
                loss: `$${this.metrics.trading.totalLoss.toFixed(2)}`,
                net: `$${(this.metrics.trading.totalProfit - this.metrics.trading.totalLoss).toFixed(2)}`
            },
            resources: {
                memory: `${(this.metrics.resources.memory.percentage * 100).toFixed(1)}%`,
                cpu: `${(this.metrics.resources.cpu.usage * 100).toFixed(1)}%`,
                disk: `${(this.metrics.resources.disk.percentage * 100).toFixed(1)}%`
            }
        };
    }

    /**
     * 获取健康状态
     */
    getHealthStatus() {
        const thresholds = this.config.alertThresholds;
        const issues = [];
        
        // 检查各项指标
        if (this.metrics.api.successRate < (1 - thresholds.apiErrorRate)) {
            issues.push('API错误率过高');
        }
        
        if (this.metrics.resources.memory.percentage > thresholds.memoryUsage) {
            issues.push('内存使用率过高');
        }
        
        if (this.metrics.resources.cpu.usage > thresholds.cpuUsage) {
            issues.push('CPU使用率过高');
        }
        
        if (this.metrics.resources.disk.percentage > thresholds.diskUsage) {
            issues.push('磁盘使用率过高');
        }
        
        if (this.metrics.trading.trades > 5 && 
            this.metrics.trading.failures / this.metrics.trading.trades > thresholds.tradeFailureRate) {
            issues.push('交易失败率过高');
        }
        
        return {
            status: issues.length === 0 ? 'healthy' : 'unhealthy',
            issues: issues,
            timestamp: new Date().toISOString(),
            metrics: this.getSummary()
        };
    }

    /**
     * 获取监控数据用于前端显示
     */
    getDashboardData() {
        return {
            system: {
                uptime: this.metrics.system.uptime,
                checks: this.metrics.system.checks,
                alerts: this.metrics.system.alerts,
                lastCheck: this.metrics.lastCheck
            },
            api: this.metrics.api,
            trading: this.metrics.trading,
            resources: this.metrics.resources,
            health: this.getHealthStatus(),
            summary: this.getSummary()
        };
    }
}

// 创建单例实例
const monitoringSystem = new MonitoringSystem();

module.exports = {
    MonitoringSystem,
    monitoringSystem,
    
    // 便捷函数
    startMonitoring: () => monitoringSystem.start(),
    stopMonitoring: () => monitoringSystem.stop(),
    updateAPIMetrics: (success, responseTime, error) => 
        monitoringSystem.updateAPIMetrics(success, responseTime, error),
    
    updateTradingMetrics: (signal, trade, success, profit) =>
        monitoringSystem.updateTradingMetrics(signal, trade, success, profit),
    
    getDashboardData: () => monitoringSystem.getDashboardData(),
    getHealthStatus: () => monitoringSystem.getHealthStatus(),
    getSummary: () => monitoringSystem.getSummary()
};