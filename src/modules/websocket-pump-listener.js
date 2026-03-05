const { Connection, PublicKey } = require('@solana/web3.js');
const EventEmitter = require('events');

const PUMP_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

class WebSocketPumpListener extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = config;
        this.connection = null;
        this.ws = null;
    }

    async start() {
        try {
            const rpcUrl = process.env.QUICKNODE_RPC_URL || process.env.SOLANA_RPC_URL;
            this.connection = new Connection(rpcUrl);
            
            console.log('🌐 【Solana RPC】监听中...');
            
            this.connection.onLogs(
                PUMP_PROGRAM,
                (logs) => this.handleLogs(logs),
                'confirmed'
            ).then(() => {
                console.log('✅ Solana RPC onLogs 订阅成功');
            });
            
            this.emit('started');
            return true;
        } catch (e) {
            console.error('❌ WebSocket启动失败:', e.message);
            return false;
        }
    }

    handleLogs(logs) {
        if (!logs || !logs.logs) return;
        const sig = logs.signature?.slice(0, 8) || 'unknown';
        
        if (logs.logs.join(' ').includes('InitializeMint')) {
            console.log('🆕 [新币创建]', sig);
            this.emit('newToken', { signature: logs.signature });
        }
    }

    stop() {
        this.emit('stopped');
    }
}

module.exports = WebSocketPumpListener;
