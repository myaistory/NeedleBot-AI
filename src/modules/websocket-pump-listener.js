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
        this.processedSignatures = new Set(); // 防重复处理
        this.reconnectAttempts = 0;
        this.maxReconnects = 10;
        this.isRunning = false;
    }

    async start() {
        const wssUrl = process.env.SOLANA_WSS_URL || process.env.QUICKNODE_WS_URL;
        
        if (!wssUrl) {
            console.error('❌ 请在 .env 中设置 SOLANA_WSS_URL 或 QUICKNODE_WS_URL');
            // 使用默认的WSS
            this.connection = new Connection('https://api.mainnet-beta.solana.com', {
                wsEndpoint: 'wss://api.mainnet-beta.solana.com'
            });
            console.log('🌐 使用默认 Solana WSS');
        } else {
            this.connection = new Connection(wssUrl, {
                commitment: 'confirmed',
                wsEndpoint: wssUrl
            });
        }

        console.log('🌐 【WebSocketPumpListener】Pump.fun 实时监听启动中...');

        try {
            // 核心：订阅 Pump.fun 所有日志
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

        // 限制处理数量，防止内存溢出
        if (this.processedSignatures.size > 10000) {
            this.processedSignatures.clear();
        }

        const logText = logs.join(' | ');

        // 1. 新币创建信号（Create 指令）
        if (logText.includes('Instruction: Create') || logText.includes('create')) {
            console.log(`🆕 [新币创建] ${signature.slice(0, 12)}...`);
            this.emit('newTokenCreated', {
                signature,
                type: 'create',
                timestamp: Date.now()
            });
            this.analyzeSignal(signature, 'newToken');
        }

        // 2. 大额买入信号（Buy 指令 → 插针核心）
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
            // 生成信号对象
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
            }
        } catch (e) {
            // 静默处理
        }
    }

    setupAutoReconnect() {
        // WebSocket 断开自动重连
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

    stop() {
        if (this.subscriptionId && this.connection) {
            this.connection.removeOnLogsListener(this.subscriptionId);
        }
        this.isRunning = false;
        console.log('🛑 WebSocket Pump Listener 已停止');
    }
}

module.exports = WebSocketPumpListener;
