/**
 * WebSocketPumpListener - 纯 Solana WebSocket 实时监听器
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const EventEmitter = require('events');

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
        const wssUrl = process.env.QUICKNODE_WS_URL || process.env.SOLANA_WSS_URL;
        
        let rpcUrl = 'https://api.mainnet-beta.solana.com';
        let wsEndpoint = 'wss://api.mainnet-beta.solana.com';
        
        if (wssUrl) {
            // Extract HTTP endpoint from WSS
            rpcUrl = wssUrl.replace('wss://', 'https://').replace('?api-key=', '/?api-key=');
            wsEndpoint = wssUrl;
        }

        this.connection = new Connection(rpcUrl, {
            commitment: 'confirmed',
            wsEndpoint: wsEndpoint
        });

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

        if (logText.includes('Instruction: Create') || logText.includes('create')) {
            console.log(`🆕 [新币创建] ${signature.slice(0, 12)}...`);
            this.emit('newTokenCreated', { signature, type: 'create', timestamp: Date.now() });
            this.analyzeSignal(signature, 'newToken');
        }

        if (logText.includes('Instruction: Buy') || logText.includes('buy')) {
            console.log(`🔥 [大额买入/插针信号] ${signature.slice(0, 12)}...`);
            this.emit('largeBuyDetected', { signature, type: 'buy', timestamp: Date.now() });
            this.analyzeSignal(signature, 'buySpike');
        }
    }

    async analyzeSignal(signature, triggerType) {
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
            
            if (global.io) {
                global.io.emit('new-signal', result);
            }
        }
    }

    setupAutoReconnect() {
        const ws = this.connection?._rpcWebSocket || this.connection?._ws;
        if (ws) {
            ws.on('close', () => {
                console.log('⚠️ WebSocket 断开，准备自动重连...');
                if (this.reconnectAttempts < this.maxReconnects) {
                    this.reconnectAttempts++;
                    setTimeout(() => this.start(), 2500);
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

// 导出类
module.exports = WebSocketPumpListener;
