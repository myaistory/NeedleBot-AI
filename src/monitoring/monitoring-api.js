/**
 * NeedleBot AI 监控API端点
 * 提供RESTful API用于前端获取监控数据
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { monitoringSystem, getDashboardData, getHealthStatus, getSummary } = require('./monitoring-system');

/**
 * @route GET /api/monitoring/health
 * @desc 获取系统健康状态
 * @access Public
 */
router.get('/health', (req, res) => {
    try {
        const healthStatus = getHealthStatus();
        res.json({
            success: true,
            data: healthStatus,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('获取健康状态失败:', error.message);
        res.status(500).json({
            success: false,
            error: '获取健康状态失败',
            message: error.message
        });
    }
});

/**
 * @route GET /api/monitoring/dashboard
 * @desc 获取监控仪表板数据
 * @access Public
 */
router.get('/dashboard', (req, res) => {
    try {
        const dashboardData = getDashboardData();
        res.json({
            success: true,
            data: dashboardData,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('获取仪表板数据失败:', error.message);
        res.status(500).json({
            success: false,
            error: '获取仪表板数据失败',
            message: error.message
        });
    }
});

/**
 * @route GET /api/monitoring/metrics
 * @desc 获取详细监控指标
 * @access Public
 */
router.get('/metrics', (req, res) => {
    try {
        const metrics = monitoringSystem.metrics;
        res.json({
            success: true,
            data: {
                system: metrics.system,
                api: metrics.api,
                trading: metrics.trading,
                resources: metrics.resources,
                summary: getSummary()
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('获取监控指标失败:', error.message);
        res.status(500).json({
            success: false,
            error: '获取监控指标失败',
            message: error.message
        });
    }
});

/**
 * @route GET /api/monitoring/alerts
 * @desc 获取告警列表
 * @access Public
 */
router.get('/alerts', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const level = req.query.level; // warning, critical
        
        let alerts = monitoringSystem.alerts;
        
        // 按级别过滤
        if (level) {
            alerts = alerts.filter(alert => alert.level === level);
        }
        
        // 按时间排序（最新的在前）
        alerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // 限制数量
        alerts = alerts.slice(0, limit);
        
        res.json({
            success: true,
            data: {
                total: monitoringSystem.alerts.length,
                filtered: alerts.length,
                alerts: alerts
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('获取告警列表失败:', error.message);
        res.status(500).json({
            success: false,
            error: '获取告警列表失败',
            message: error.message
        });
    }
});

/**
 * @route GET /api/monitoring/summary
 * @desc 获取监控摘要
 * @access Public
 */
router.get('/summary', (req, res) => {
    try {
        const summary = getSummary();
        res.json({
            success: true,
            data: summary,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('获取监控摘要失败:', error.message);
        res.status(500).json({
            success: false,
            error: '获取监控摘要失败',
            message: error.message
        });
    }
});

/**
 * @route POST /api/monitoring/control
 * @desc 控制监控系统
 * @access Public
 */
router.post('/control', (req, res) => {
    try {
        const { action } = req.body;
        
        if (!action) {
            return res.status(400).json({
                success: false,
                error: '缺少action参数'
            });
        }
        
        let message = '';
        
        switch (action.toLowerCase()) {
            case 'start':
                monitoringSystem.start();
                message = '监控系统已启动';
                break;
                
            case 'stop':
                monitoringSystem.stop();
                message = '监控系统已停止';
                break;
                
            case 'reset':
                // 重置指标（保留告警）
                monitoringSystem.metrics = {
                    system: {
                        startTime: Date.now(),
                        uptime: 0,
                        checks: 0,
                        alerts: monitoringSystem.metrics.system.alerts
                    },
                    api: { calls: 0, errors: 0, successRate: 1.0, avgResponseTime: 0, lastError: null },
                    trading: { signals: 0, trades: 0, successes: 0, failures: 0, successRate: 1.0, totalProfit: 0, totalLoss: 0 },
                    resources: { memory: { used: 0, total: 0, percentage: 0 }, cpu: { usage: 0, load: [0, 0, 0] }, disk: { used: 0, total: 0, percentage: 0 } },
                    lastCheck: null
                };
                message = '监控指标已重置';
                break;
                
            case 'clearalerts':
                monitoringSystem.alerts = [];
                message = '告警已清空';
                break;
                
            default:
                return res.status(400).json({
                    success: false,
                    error: '未知的action参数'
                });
        }
        
        res.json({
            success: true,
            message: message,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        logger.error('控制监控系统失败:', error.message);
        res.status(500).json({
            success: false,
            error: '控制监控系统失败',
            message: error.message
        });
    }
});

/**
 * @route GET /api/monitoring/config
 * @desc 获取监控配置
 * @access Public
 */
router.get('/config', (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                config: monitoringSystem.config,
                status: {
                    isMonitoring: monitoringSystem.isMonitoring,
                    checks: monitoringSystem.metrics.system.checks,
                    alerts: monitoringSystem.metrics.system.alerts
                }
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('获取监控配置失败:', error.message);
        res.status(500).json({
            success: false,
            error: '获取监控配置失败',
            message: error.message
        });
    }
});

/**
 * @route POST /api/monitoring/config
 * @desc 更新监控配置
 * @access Public
 */
router.post('/config', (req, res) => {
    try {
        const updates = req.body;
        
        if (!updates || typeof updates !== 'object') {
            return res.status(400).json({
                success: false,
                error: '无效的配置数据'
            });
        }
        
        // 更新配置
        Object.assign(monitoringSystem.config, updates);
        
        // 如果更改了检查间隔，需要重启监控
        if (updates.checkInterval && monitoringSystem.isMonitoring) {
            monitoringSystem.stop();
            monitoringSystem.config.checkInterval = updates.checkInterval;
            monitoringSystem.start();
        }
        
        res.json({
            success: true,
            message: '监控配置已更新',
            data: monitoringSystem.config,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        logger.error('更新监控配置失败:', error.message);
        res.status(500).json({
            success: false,
            error: '更新监控配置失败',
            message: error.message
        });
    }
});

/**
 * @route GET /api/monitoring/history
 * @desc 获取历史监控数据
 * @access Public
 */
router.get('/history', async (req, res) => {
    try {
        const fs = require('fs').promises;
        const path = require('path');
        
        const metricsFile = path.join(__dirname, '../../logs/metrics.json');
        
        let historyData = {};
        try {
            const data = await fs.readFile(metricsFile, 'utf8');
            historyData = JSON.parse(data);
        } catch (error) {
            // 文件不存在或解析错误
            historyData = {
                timestamp: new Date().toISOString(),
                metrics: monitoringSystem.metrics,
                summary: getSummary()
            };
        }
        
        res.json({
            success: true,
            data: historyData,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        logger.error('获取历史监控数据失败:', error.message);
        res.status(500).json({
            success: false,
            error: '获取历史监控数据失败',
            message: error.message
        });
    }
});

module.exports = router;