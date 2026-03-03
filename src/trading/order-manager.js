#!/usr/bin/env node
/**
 * 订单管理系统
 * 
 * 管理 Jupiter 交易的完整生命周期：创建、监控、取消
 * 
 * 功能:
 * - 创建买入/卖出订单
 * - 订单状态跟踪
 * - 订单历史记录
 * - 失败重试机制
 * - 订单取消
 */

const EventEmitter = require('events');
const JupiterClient = require('./jupiter-client');

// 订单状态枚举
const OrderStatus = {
    PENDING: 'pending',       // 等待执行
    GETTING_QUOTE: 'getting_quote', // 获取报价中
    SIMULATING: 'simulating', // 模拟中
    SIGNING: 'signing',       // 签名中
    SUBMITTED: 'submitted',   // 已提交
    CONFIRMED: 'confirmed',   // 已确认
    FAILED: 'failed',         // 失败
    CANCELLED: 'cancelled'    // 已取消
};

// 订单类型
const OrderType = {
    BUY: 'buy',
    SELL: 'sell'
};

class OrderManager extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.jupiterClient = new JupiterClient(config);
        this.orders = new Map();
        this.orderHistory = [];
        this.maxRetries = config.orderManager?.maxRetries || 3;
        this.orderTimeout = config.orderManager?.orderTimeout || 300000; // 5 分钟
        
        // 订单统计
        this.stats = {
            totalOrders: 0,
            successfulOrders: 0,
            failedOrders: 0,
            cancelledOrders: 0,
            totalVolume: 0
        };
        
        console.log('✅ OrderManager 初始化完成');
    }
    
    /**
     * 创建订单
     * 
     * @param {string} type 订单类型 (buy/sell)
     * @param {string} inputMint 输入代币地址
     * @param {string} outputMint 输出代币地址
     * @param {number} amount 输入数量（最小单位）
     * @param {Object} options 订单选项
     * @returns {Promise<Object>} 订单信息
     */
    async createOrder(type, inputMint, outputMint, amount, options = {}) {
        const orderId = this._generateOrderId();
        
        // 确保type是字符串
        const orderType = String(type).toLowerCase();
        
        const order = {
            id: orderId,
            type: orderType,
            inputMint,
            outputMint,
            amount,
            status: OrderStatus.PENDING,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            retries: 0,
            logs: [],
            metrics: {}
        };
        
        // 添加选项
        if (options.slippageBps) {
            order.slippageBps = options.slippageBps;
        }
        if (options.priorityFee) {
            order.priorityFee = options.priorityFee;
        }
        
        this.orders.set(orderId, order);
        this.stats.totalOrders++;
        
        this._log(orderId, `订单创建：${orderType.toUpperCase()} ${this._formatTokenAmount(inputMint, amount)}`);
        this.emit('orderCreated', order);
        
        // 开始执行订单
        this._executeOrder(order).catch(error => {
            console.error(`订单 ${orderId} 执行失败:`, error.message);
        });
        
        return order;
    }
    
    /**
     * 执行订单
     */
    async _executeOrder(order) {
        try {
            // 步骤 1: 获取报价
            order.status = OrderStatus.GETTING_QUOTE;
            order.updatedAt = new Date().toISOString();
            this._log(order.id, '获取报价...');
            this.emit('orderStatusChanged', order);
            
            const quoteStartTime = Date.now();
            const quote = await this.jupiterClient.getQuote(
                order.inputMint,
                order.outputMint,
                order.amount,
                order.slippageBps
            );
            order.metrics.quoteTime = Date.now() - quoteStartTime;
            order.quote = quote;
            
            this._log(order.id, `报价获取成功：${quote.outAmount} (价格影响：${(quote.priceImpact * 100).toFixed(4)}%)`);
            
            // 步骤 2: 模拟交易
            order.status = OrderStatus.SIMULATING;
            order.updatedAt = new Date().toISOString();
            this._log(order.id, '模拟交易...');
            this.emit('orderStatusChanged', order);
            
            const swapInstruction = await this.jupiterClient.getSwapInstruction(
                quote,
                '11111111111111111111111111111111' // 示例公钥，实际使用时替换
            );
            
            const simulationResult = await this.jupiterClient.simulateTransaction(
                swapInstruction.swapTransaction
            );
            
            if (!simulationResult.success) {
                throw new Error(`交易模拟失败：${simulationResult.error}`);
            }
            
            order.metrics.simulationTime = Date.now() - quoteStartTime;
            order.metrics.unitsConsumed = simulationResult.unitsConsumed;
            this._log(order.id, `交易模拟成功 (消耗 ${simulationResult.unitsConsumed} 计算单元)`);
            
            // 步骤 3: 等待签名和提交（这里只是模拟，实际需要钱包签名）
            order.status = OrderStatus.SIGNING;
            order.updatedAt = new Date().toISOString();
            this._log(order.id, '等待签名...');
            this.emit('orderStatusChanged', order);
            
            await this._sleep(1000); // 模拟签名延迟
            
            order.status = OrderStatus.SUBMITTED;
            order.updatedAt = new Date().toISOString();
            this._log(order.id, '交易已提交');
            this.emit('orderStatusChanged', order);
            
            // 步骤 4: 等待确认
            await this._sleep(2000); // 模拟确认延迟
            
            order.status = OrderStatus.CONFIRMED;
            order.updatedAt = new Date().toISOString();
            order.completedAt = new Date().toISOString();
            order.signature = this._generateMockSignature();
            order.metrics.totalTime = Date.now() - quoteStartTime;
            
            this._log(order.id, `✅ 交易已确认 (总耗时：${order.metrics.totalTime}ms)`);
            this.emit('orderStatusChanged', order);
            this.emit('orderCompleted', order);
            
            // 更新统计
            this.stats.successfulOrders++;
            this.stats.totalVolume += Number(order.amount);
            
            // 移动到历史记录
            this.orderHistory.push(order);
            this.orders.delete(order.id);
            
        } catch (error) {
            this._handleOrderError(order, error);
        }
    }
    
    /**
     * 处理订单错误
     */
    async _handleOrderError(order, error) {
        order.retries++;
        order.updatedAt = new Date().toISOString();
        order.lastError = error.message;
        
        this._log(order.id, `❌ 错误：${error.message}`);
        
        if (order.retries < this.maxRetries) {
            this._log(order.id, `准备重试 (${order.retries}/${this.maxRetries})...`);
            await this._sleep(2000 * order.retries);
            
            try {
                await this._executeOrder(order);
            } catch (retryError) {
                this._handleOrderError(order, retryError);
            }
        } else {
            order.status = OrderStatus.FAILED;
            order.failedAt = new Date().toISOString();
            this._log(order.id, '订单失败（达到最大重试次数）');
            this.emit('orderStatusChanged', order);
            this.emit('orderFailed', order);
            
            this.stats.failedOrders++;
            
            // 移动到历史记录
            this.orderHistory.push(order);
            this.orders.delete(order.id);
        }
    }
    
    /**
     * 取消订单
     */
    cancelOrder(orderId) {
        const order = this.orders.get(orderId);
        
        if (!order) {
            throw new Error(`订单不存在：${orderId}`);
        }
        
        if ([OrderStatus.CONFIRMED, OrderStatus.FAILED, OrderStatus.CANCELLED].includes(order.status)) {
            throw new Error(`订单无法取消，当前状态：${order.status}`);
        }
        
        order.status = OrderStatus.CANCELLED;
        order.updatedAt = new Date().toISOString();
        order.cancelledAt = new Date().toISOString();
        
        this._log(order.id, '订单已取消');
        this.emit('orderStatusChanged', order);
        this.emit('orderCancelled', order);
        
        this.stats.cancelledOrders++;
        
        // 移动到历史记录
        this.orderHistory.push(order);
        this.orders.delete(order.id);
        
        return order;
    }
    
    /**
     * 获取订单（getOrder的别名，为了兼容性）
     */
    getOrder(orderId) {
        return this.getOrderStatus(orderId);
    }
    
    /**
     * 获取订单状态
     */
    getOrderStatus(orderId) {
        const order = this.orders.get(orderId);
        if (!order) {
            // 在历史记录中查找
            const historicalOrder = this.orderHistory.find(o => o.id === orderId);
            return historicalOrder || null;
        }
        return order;
    }
    
    /**
     * 获取所有活跃订单
     */
    getActiveOrders() {
        return Array.from(this.orders.values());
    }
    
    /**
     * 获取订单历史
     */
    getOrderHistory(limit = 100) {
        return this.orderHistory.slice(-limit);
    }
    
    /**
     * 获取统计信息
     */
    getStats() {
        return {
            ...this.stats,
            activeOrders: this.orders.size,
            successRate: this.stats.totalOrders > 0
                ? ((this.stats.successfulOrders / this.stats.totalOrders) * 100).toFixed(2) + '%'
                : '0%'
        };
    }
    
    /**
     * 生成订单 ID
     */
    _generateOrderId() {
        return `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    }
    
    /**
     * 生成模拟签名
     */
    _generateMockSignature() {
        const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        let signature = '';
        for (let i = 0; i < 88; i++) {
            signature += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return signature;
    }
    
    /**
     * 格式化代币金额
     */
    _formatTokenAmount(mint, amount) {
        const numAmount = Number(amount);
        
        // SOL
        if (mint === 'So11111111111111111111111111111111111111112') {
            return `${(numAmount / 1e9).toFixed(6)} SOL`;
        }
        
        // USDC, USDT
        if (mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' ||
            mint === 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB') {
            return `$${(numAmount / 1e6).toFixed(2)}`;
        }
        
        return numAmount.toString();
    }
    
    /**
     * 记录日志
     */
    _log(orderId, message) {
        const order = this.orders.get(orderId);
        if (order) {
            order.logs.push({
                timestamp: new Date().toISOString(),
                message
            });
            console.log(`[${orderId}] ${message}`);
        }
    }
    
    /**
     * 休眠
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 导出
module.exports = { OrderManager, OrderStatus, OrderType };

// 测试代码
if (require.main === module) {
    (async () => {
        console.log('🧪 测试 OrderManager...\n');
        
        const manager = new OrderManager();
        
        // 监听事件
        manager.on('orderCreated', order => {
            console.log(`📝 订单创建：${order.id}\n`);
        });
        
        manager.on('orderStatusChanged', order => {
            console.log(`📊 订单状态变更：${order.id} -> ${order.status}`);
        });
        
        manager.on('orderCompleted', order => {
            console.log(`✅ 订单完成：${order.id}\n`);
            console.log('统计信息:', manager.getStats());
        });
        
        manager.on('orderFailed', order => {
            console.log(`❌ 订单失败：${order.id}\n`);
        });
        
        try {
            // 测试创建买单：0.1 SOL → USDC
            const order = await manager.createOrder(
                OrderType.BUY,
                'So11111111111111111111111111111111111111112',
                'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                0.1 * 1e9, // 0.1 SOL
                { slippageBps: 50 }
            );
            
            console.log('\n等待订单执行完成...\n');
            
        } catch (error) {
            console.error('测试失败:', error.message);
        }
    })();
}
