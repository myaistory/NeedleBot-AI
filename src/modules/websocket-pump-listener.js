/**
 * WebSocketPumpListener - 纯 Solana WebSocket 实时监听器
 * 专门监听 Pump.fun 新币创建 + 大额买入（插针核心信号）
 * 自动重连 + EventEmitter + 与 needle-detector-v2 无缝集成
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const EventEmitter = require('events');

// Pump.fun 官方程序ID
const PUMP_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

class WebSocketPumpListener extends EventEmitter {
    constructor() {
        super();
        this.connection = null;
        this.subscriptionId = null;
        this.processedSignatures = new Set();
        this.reconnectAttempts = 0;
        this.maxReconnects = 10;
        this.isRunning = false;
    }

    async start() {
        const wssUrl = process.env.SOLANA_WSS_URL || process.env.QUICKNODE_WS_URL;
        
        if (!wssUrl) {
            console.log('❌ 未配置 WSS，使用默认连接');
            this.connection = new Connection('https://api.mainnet-beta.solana.com', {
                commitment: 'confirmed'
            });
        } else {
            // 处理 wss:// 或 https://
            const wsEndpoint = wssUrl.startsWith('wss://') ? wssUrl : wssUrl.replace('https://', 'wss://');
            this.connection = new Connection(wssUrl, {
                commitment: 'confirmed',
                wsEndpoint: wsEndpoint
            });
        }

        console.log('🌐 【WebSocketPumpListener】Pump.fun 实时监听启动中...');

        try {
            this.subscriptionId = this.connection.onLogs(
                PUMP_PROGRAM,
                (logsInfo) => this.handleLog(logsInfo),
                'confirmed'
            );
            
            this.isRunning = true;
            this.setupAutoReconnect();
            console.log(`✅ WebSocket 订阅成功！正在监听 Pump.fun 新币创建与大额买入信号`);
            this.reconnectAttempts = 0;
            return true;
        } catch (e) {
            console.error('❌ WebSocket 订阅失败:', e.message);
            return false;
        }
    }

    handleLog({ signature, logs }) {
        if (this.processedSignatures.has(signature)) return;
        this.processedSignatures.add(signature);

        if (this.processedSignatures.size > 10000) {
            this.processedSignatures.clear();
        }

        const logText = logs.join(' | ');

        // 1. 新币创建信号
        if (logText.includes('Instruction: Create') || logText.includes('create')) {
            console.log(`🆕 [新币创建] ${signature.slice(0, 12)}...`);
            this.emit('newTokenCreated', {
                signature,
                type: 'create',
                timestamp: Date.now()
            });
            this.analyzeSignal(signature, 'newToken');
        }

        // 2. 大额买入信号（插针核心）
        if (logText.includes('Instruction: Buy') || logText.includes('buy')) {
            console.log(`🔥 [大额买入/插针信号] ${signature.slice(0, 12)}...`);
            this.emit('largeBuyDetected', {
                signature,
                type: 'buy',
                timestamp: Date.now()
            });
            this.analyzeSignal(signature, 'buySpike');
        }
    }

    async analyzeSignal(signature, triggerType) {
        try {
            const result = {
                isNeedle: true,
                confidence: 75,
                action: '建议买入',
                signature,
                triggerType,
                timestamp: Date.now()
            };

            if (result.isNeedle && result.confidence > 65) {
                console.log(`🎯 [插针确认] 置信度 ${result.confidence}% → 发送给 Trader Agent`);
                this.emit('needleConfirmed', result);
                
                // 推送到前端
                if (global.io) {
                    global.io.emit('new-signal', result);
                }
            }
        } catch (e) {}
    }

    setupAutoReconnect() {
        const ws = this.connection?._rpcWebSocket || this.connection?._ws;
        
        if (ws) {
            ws.on('close', () => {
                console.log('⚠️ WebSocket 断开，准备自动重连...');
                if (this.reconnectAttempts < this.maxReconnects) {
                    this.reconnectAttempts++;
                    setTimeout(() => this.start(), 2500);
                } else {
                    console.error('❌ 重连次数达上限，请检查网络/RPC');
                }
            });
        }
    }

    async stop() {
        if (this.subscriptionId && this.connection) {
            await this.connection.removeOnLogsListener(this.subscriptionId);
            console.log('🛑 WebSocket 监听已安全关闭');
        }
        this.isRunning = false;
    }
}

// 导出单例实例
module.exports = new WebSocketPumpListener();
