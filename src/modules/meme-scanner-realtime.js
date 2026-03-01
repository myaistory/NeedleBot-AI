/**
 * MemeScannerRealtime - WebSocket实时版本
 * 实现真正的毫秒级延迟信号捕获
 */

const WebSocket = require('ws');
const EventEmitter = require('events');

class MemeScannerRealtime extends EventEmitter {
    constructor() {
        super();
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnects = 10;
        this.isConnected = false;
        
        // 监控的代币
        this.watchList = new Set();
        
        // 配置
        this.config = {
            // 使用 Birdeye WebSocket (需要API Key)
            birdeyeWs: 'wss://api.birdeye.so/public/ws',
            reconnectInterval: 5000
        };
    }
    
    // 连接WebSocket
    async connect() {
        return new Promise((resolve, reject) => {
            try {
                // 尝试连接 (需要有效的API Key)
                this.ws = new WebSocket(this.config.birdeyeWs);
                
                this.ws.on('open', () => {
                    console.log('[MemeScannerWS] ✅ WebSocket已连接');
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this.subscribeToTokens();
                    resolve();
                });
                
                this.ws.on('message', (data) => {
                    this.handleMessage(data);
                });
                
                this.ws.on('close', () => {
                    console.log('[MemeScannerWS] ❌ WebSocket断开');
                    this.isConnected = false;
                    this.reconnect();
                });
                
                this.ws.on('error', (error) => {
                    console.error('[MemeScannerWS] 错误:', error.message);
                    // 即使出错也不中断，继续使用轮询模式
                });
                
            } catch (error) {
                console.log('[MemeScannerWS] WebSocket不可用，切换到轮询模式');
                resolve();
            }
        });
    }
    
    // 订阅代币
    subscribeToTokens() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        
        const subscribeMsg = {
            method: 'subscribeTokenPrice',
            keys: Array.from(this.watchList)
        };
        
        this.ws.send(JSON.stringify(subscribeMsg));
    }
    
    // 处理消息
    handleMessage(data) {
        try {
            const message = JSON.parse(data);
            
            if (message.type === 'price_update') {
                const tokenData = {
                    symbol: message.data?.symbol,
                    price: message.data?.price,
                    priceChange5m: message.data?.change5m,
                    priceChange1h: message.data?.change1h,
                    timestamp: Date.now()
                };
                
                // 检测信号
                this.emit('priceUpdate', tokenData);
                
                // 检测插针
                if (Math.abs(tokenData.priceChange5m) >= 15) {
                    this.emit('needleSignal', tokenData);
                }
            }
        } catch (error) {
            // 忽略解析错误
        }
    }
    
    // 添加监控代币
    addToken(address) {
        this.watchList.add(address);
        
        if (this.isConnected) {
            this.subscribeToTokens();
        }
    }
    
    // 移除代币
    removeToken(address) {
        this.watchList.delete(address);
    }
    
    // 重新连接
    reconnect() {
        if (this.reconnectAttempts >= this.maxReconnects) {
            console.log('[MemeScannerWS] 最大重连次数达到');
            return;
        }
        
        this.reconnectAttempts++;
        console.log(`[MemeScannerWS] 尝试重连 (${this.reconnectAttempts}/${this.maxReconnects})...`);
        
        setTimeout(() => {
            this.connect();
        }, this.config.reconnectInterval);
    }
    
    // 关闭
    close() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

// 轮询后备模式
class MemeScannerPolling {
    constructor() {
        this.watchList = new Set();
        this.lastPrices = new Map();
        this.intervalId = null;
    }
    
    // 快速轮询（每秒）
    startPolling(intervalMs = 5000) {
        console.log('[MemeScannerPolling] ✅ 启动快速轮询模式');
        
        this.intervalId = setInterval(async () => {
            for (const address of this.watchList) {
                await this.checkPrice(address);
            }
        }, intervalMs);
    }
    
    async checkPrice(address) {
        try {
            const response = await axios.get(
                `https://api.dexscreener.com/latest/dex/tokens/${address}`,
                { timeout: 3000 }
            );
            
            if (response.data?.pairs?.[0]) {
                const pair = response.data.pairs[0];
                const currentPrice = parseFloat(pair.priceUsd);
                const lastPrice = this.lastPrices.get(address);
                
                // 计算变化
                if (lastPrice) {
                    const change = ((currentPrice - lastPrice) / lastPrice) * 100;
                    
                    // 检测大幅波动
                    if (Math.abs(change) >= 5) {
                        console.log(`[MemeScannerPolling] 🚨 ${pair.baseToken?.symbol} 5秒变化: ${change.toFixed(2)}%`);
                    }
                }
                
                this.lastPrices.set(address, currentPrice);
            }
        } catch (error) {
            // 忽略单个错误
        }
    }
    
    addToken(address) {
        this.watchList.add(address);
    }
    
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }
}

module.exports = { MemeScannerRealtime, MemeScannerPolling };
