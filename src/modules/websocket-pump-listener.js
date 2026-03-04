const { Connection, PublicKey } = require('@solana/web3.js');

const PUMP_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

class WebSocketPumpListener extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = config;
        this.connection = null;
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 5000;
    }

    async start() {
        try {
            // Use Helius RPC WebSocket for better reliability
            const rpcUrl = process.env.QUICKNODE_RPC_URL || process.env.SOLANA_RPC_URL;
            this.connection = new Connection(rpcUrl);
            
            console.log('🌐 【WebSocketPumpListener】正在连接 Solana RPC...');
            
            // Use onLogs for direct Solana chain listening
            this.connection.onLogs(
                PUMP_PROGRAM,
                (logs, ctx) => {
                    this.handleLogs(logs);
                },
                'confirmed'
            ).then(() => {
                console.log('✅ Solana RPC onLogs 订阅成功！监听Pump.fun程序');
            }).catch(err => {
                console.error('❌ onLogs订阅失败:', err.message);
            });
            
            this.emit('started');
            return true;
        } catch (e) {
            console.error('❌ WebSocket启动失败:', e.message);
            this.emit('error', e);
            return false;
        }
    }

    handleLogs(logs) {
        if (!logs || !logs.logs) return;
        
        const logString = logs.logs.join(' ');
        
        // Detect new token creation
        if (logString.includes('InitializeMint') || logString.includes('create')) {
            console.log('🆕 [新币创建]', logs.signature?.slice(0, 8));
            this.emit('newToken', { signature: logs.signature });
        }
        
        // Detect large buy
        if (logString.includes('transfer') && logString.includes('5000000000')) {
            console.log('🔥 [大额转账]', logs.signature?.slice(0, 8));
            this.emit('largeTransfer', { signature: logs.signature });
        }
    }

    stop() {
        if (this.ws) {
            this.ws.close();
        }
        this.emit('stopped');
    }
}

module.exports = WebSocketPumpListener;
