# Jupiter API 集成指南

**版本**: 1.0.0  
**创建时间**: 2026-02-26  
**作者**: NeedleBot AI CTO  
**状态**: ✅ 完成

---

## 📋 目录

1. [概述](#概述)
2. [快速开始](#快速开始)
3. [配置指南](#配置指南)
4. [API 使用示例](#api-使用示例)
5. [最佳实践](#最佳实践)
6. [错误处理](#错误处理)
7. [常见问题](#常见问题)
8. [参考资源](#参考资源)

---

## 概述

### Jupiter 是什么？

Jupiter 是 Solana 生态系统中最大的去中心化交易所（DEX）聚合器。它通过以下方式为交易者提供最优价格：

- **多路径聚合**: 同时从多个 DEX 获取流动性
- **智能路由**: 自动选择最优交易路径
- **价格优化**: 最小化价格影响和滑点
- **低延迟**: 快速的报价和交易执行

### 核心组件

本集成包含两个核心组件：

1. **JupiterClient** (`src/trading/jupiter-client.js`)
   - 封装 Jupiter Quote API 和 Swap API
   - 提供报价获取、交易模拟、价格影响分析
   - 自动重试和错误处理

2. **OrderManager** (`src/trading/order-manager.js`)
   - 管理订单的完整生命周期
   - 订单状态跟踪和历史记录
   - 事件驱动的架构

### 支持的 API

| API | 端点 | 功能 |
|-----|------|------|
| Quote API | `https://quote-api.jup.ag/v6/quote` | 获取最优交易报价 |
| Swap API | `https://quote-api.jup.ag/v6/swap` | 生成交易指令 |

---

## 快速开始

### 1. 安装依赖

```bash
cd /root/.openclaw/workspace/needlebot-improved
npm install @solana/web3.js axios
```

### 2. 基本使用

```javascript
const JupiterClient = require('./src/trading/jupiter-client');

// 创建客户端实例
const client = new JupiterClient();

// 获取报价：1 SOL → USDC
async function getQuote() {
    const quote = await client.getQuote(
        client.tokens.SOL,           // 输入代币：SOL
        client.tokens.USDC,          // 输出代币：USDC
        1 * 1e9                      // 数量：1 SOL (以最小单位表示)
    );
    
    console.log('报价详情:');
    console.log(`输入：${client._formatAmount(quote.inAmount, client.tokens.SOL)}`);
    console.log(`输出：${client._formatAmount(quote.outAmount, client.tokens.USDC)}`);
    console.log(`价格影响：${(quote.priceImpact * 100).toFixed(4)}%`);
    console.log(`交易路径：${quote.routePath}`);
}

getQuote().catch(console.error);
```

### 3. 运行测试

```bash
node test/test-jupiter-integration.js
```

---

## 配置指南

### 配置文件结构

创建 `config/trading-config.json`:

```json
{
  "jupiter": {
    "baseUrl": "https://quote-api.jup.ag/v6",
    "timeout": 10000,
    "maxRetries": 3,
    "retryDelay": 1000
  },
  "rpc": {
    "endpoint": "https://purple-wiser-tab.solana-mainnet.quiknode.pro",
    "timeout": 5000
  },
  "trading": {
    "defaultSlippageBps": 50,
    "maxSlippageBps": 100,
    "minLiquidity": 1000
  },
  "orderManager": {
    "maxRetries": 3,
    "orderTimeout": 300000
  }
}
```

### 配置项说明

#### Jupiter 配置

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `baseUrl` | string | `https://quote-api.jup.ag/v6` | Jupiter API 基础 URL |
| `timeout` | number | `10000` | API 请求超时（毫秒） |
| `maxRetries` | number | `3` | 最大重试次数 |
| `retryDelay` | number | `1000` | 重试延迟（毫秒） |

#### RPC 配置

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `endpoint` | string | QuickNode URL | Solana RPC 端点 |
| `timeout` | number | `5000` | RPC 请求超时（毫秒） |

#### 交易配置

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `defaultSlippageBps` | number | `50` | 默认滑点（基点，1bp = 0.01%） |
| `maxSlippageBps` | number | `100` | 最大允许滑点 |
| `minLiquidity` | number | `1000` | 最小流动性要求（USD） |

---

## API 使用示例

### 1. 获取报价

```javascript
const client = new JupiterClient();

// 基础报价
const quote = await client.getQuote(
    'So11111111111111111111111111111111111111112', // SOL
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',  // USDC
    1 * 1e9  // 1 SOL
);

// 自定义滑点
const quoteWithSlippage = await client.getQuote(
    client.tokens.SOL,
    client.tokens.USDC,
    1 * 1e9,
    100  // 1% 滑点
);

console.log('报价信息:', {
    输入金额：client._formatAmount(quote.inAmount, client.tokens.SOL),
    输出金额：client._formatAmount(quote.outAmount, client.tokens.USDC),
    价格影响：(quote.priceImpact * 100).toFixed(4) + '%',
    交易路径：quote.routePath,
    响应时间：quote.responseTime + 'ms'
});
```

### 2. 创建订单

```javascript
const { OrderManager, OrderType } = require('./src/trading/order-manager');

const manager = new OrderManager();

// 监听订单事件
manager.on('orderCreated', (order) => {
    console.log(`订单创建：${order.id}`);
});

manager.on('orderStatusChanged', (order) => {
    console.log(`订单状态变更：${order.id} -> ${order.status}`);
});

manager.on('orderCompleted', (order) => {
    console.log(`订单完成：${order.id}`);
    console.log(`交易签名：${order.signature}`);
});

manager.on('orderFailed', (order) => {
    console.error(`订单失败：${order.id}`);
    console.error(`错误：${order.lastError}`);
});

// 创建买单
const buyOrder = await manager.createOrder(
    OrderType.BUY,
    client.tokens.SOL,
    client.tokens.USDC,
    0.1 * 1e9,  // 0.1 SOL
    { slippageBps: 50 }
);

// 查询订单状态
const orderStatus = manager.getOrderStatus(buyOrder.id);
console.log('订单状态:', orderStatus.status);

// 获取活跃订单
const activeOrders = manager.getActiveOrders();
console.log('活跃订单数:', activeOrders.length);

// 获取订单历史
const history = manager.getOrderHistory(10);
console.log('最近订单:', history.length);
```

### 3. 交易模拟

```javascript
// 获取报价
const quote = await client.getQuote(
    client.tokens.SOL,
    client.tokens.USDC,
    0.1 * 1e9
);

// 生成交易指令
const swapInstruction = await client.getSwapInstruction(
    quote,
    'YourWalletPublicKey'
);

// 模拟交易
const simulation = await client.simulateTransaction(
    swapInstruction.swapTransaction
);

if (simulation.success) {
    console.log('✅ 交易模拟成功');
    console.log(`消耗计算单元：${simulation.unitsConsumed}`);
} else {
    console.error('❌ 交易模拟失败');
    console.error(`错误：${simulation.error}`);
}
```

### 4. 获取统计信息

```javascript
// Jupiter 客户端统计
const clientMetrics = client.getMetrics();
console.log('Jupiter 客户端统计:', clientMetrics);

// 订单管理器统计
const orderStats = manager.getStats();
console.log('订单统计:', orderStats);
```

---

## 最佳实践

### 1. 滑点设置

**推荐设置**:
- 正常市场：30-50 bps (0.3-0.5%)
- 波动市场：50-100 bps (0.5-1%)
- 高波动市场：100-200 bps (1-2%)

```javascript
// 根据市场波动动态调整滑点
function calculateDynamicSlippage(quote) {
    const baseSlippage = 50; // 0.5%
    const priceImpact = quote.priceImpact * 10000; // 转换为 bps
    
    // 滑点 = 基础滑点 + 价格影响 * 1.5
    const dynamicSlippage = baseSlippage + (priceImpact * 1.5);
    
    return Math.min(dynamicSlippage, 200); // 最大 2%
}
```

### 2. 价格影响监控

```javascript
// 检查价格影响是否可接受
function isPriceImpactAcceptactable(quote, maxImpact = 0.02) {
    if (quote.priceImpact > maxImpact) {
        console.warn(`⚠️  价格影响过大：${(quote.priceImpact * 100).toFixed(2)}%`);
        return false;
    }
    return true;
}

// 使用示例
const quote = await client.getQuote(...);
if (!isPriceImpactAcceptactable(quote)) {
    console.log('取消交易，价格影响过大');
    return;
}
```

### 3. 错误处理

```javascript
async function safeGetQuote(inputMint, outputMint, amount) {
    try {
        const quote = await client.getQuote(inputMint, outputMint, amount);
        return { success: true, quote };
    } catch (error) {
        if (error.message.includes('滑点过大')) {
            return { 
                success: false, 
                error: 'SLIPPAGE_TOO_HIGH',
                message: error.message 
            };
        }
        
        if (error.message.includes('流动性不足')) {
            return { 
                success: false, 
                error: 'INSUFFICIENT_LIQUIDITY',
                message: error.message 
            };
        }
        
        // 网络错误，可以重试
        return { 
            success: false, 
            error: 'NETWORK_ERROR',
            message: error.message,
            retryable: true 
        };
    }
}
```

### 4. 断路器模式

```javascript
class CircuitBreaker {
    constructor(failureThreshold = 5, resetTimeout = 60000) {
        this.failures = 0;
        this.threshold = failureThreshold;
        this.resetTimeout = resetTimeout;
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    }
    
    async execute(fn) {
        if (this.state === 'OPEN') {
            throw new Error('断路器已打开，请求被拒绝');
        }
        
        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }
    
    onSuccess() {
        this.failures = 0;
        this.state = 'CLOSED';
    }
    
    onFailure() {
        this.failures++;
        if (this.failures >= this.threshold) {
            this.state = 'OPEN';
            console.warn('⚠️  断路器已打开，停止请求');
            setTimeout(() => {
                this.state = 'HALF_OPEN';
                console.log('断路器进入半开状态');
            }, this.resetTimeout);
        }
    }
}
```

---

## 错误处理

### 常见错误代码

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `SLIPPAGE_TOO_HIGH` | 滑点设置超过最大值 | 降低滑点或增加 maxSlippageBps |
| `INSUFFICIENT_LIQUIDITY` | 交易对流动性不足 | 减少交易金额或选择其他交易对 |
| `INVALID_TOKEN` | 代币地址无效 | 检查代币地址是否正确 |
| `NETWORK_ERROR` | 网络连接问题 | 检查网络，使用重试机制 |
| `TIMEOUT` | 请求超时 | 增加 timeout 或检查网络延迟 |
| `SIMULATION_FAILED` | 交易模拟失败 | 检查交易参数和钱包余额 |

### 错误处理示例

```javascript
async function executeTradeWithRetry(tradeParams, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const quote = await client.getQuote(
                tradeParams.inputMint,
                tradeParams.outputMint,
                tradeParams.amount
            );
            
            // 验证报价
            if (!isPriceImpactAcceptactable(quote)) {
                throw new Error('价格影响过大');
            }
            
            return { success: true, quote };
            
        } catch (error) {
            console.log(`尝试 ${attempt}/${maxRetries} 失败：${error.message}`);
            
            if (attempt === maxRetries) {
                return { 
                    success: false, 
                    error: error.message,
                    final: true 
                };
            }
            
            // 等待后重试
            await new Promise(resolve => 
                setTimeout(resolve, 1000 * attempt)
            );
        }
    }
}
```

---

## 常见问题

### Q1: 为什么报价获取失败？

**可能原因**:
1. 网络连接问题
2. Jupiter API 暂时不可用
3. 代币地址无效
4. 流动性不足

**解决方案**:
- 检查网络连接
- 使用重试机制
- 验证代币地址
- 减少交易金额

### Q2: 如何选择最优滑点？

**建议**:
- 小金额交易（<$100）: 30-50 bps
- 中等金额（$100-$1000）: 50-100 bps
- 大金额（>$1000）: 100-200 bps

根据市场波动和价格影响动态调整。

### Q3: 交易模拟成功但实际执行失败？

**可能原因**:
1. 价格快速变化
2. 流动性变化
3. 区块确认超时

**解决方案**:
- 缩短报价到执行的时间间隔
- 使用更高的滑点容忍度
- 实现交易重试机制

### Q4: 如何降低交易费用？

**建议**:
1. 使用动态优先费（已实现）
2. 避免网络拥堵时段
3. 批量执行交易
4. 使用 Versioned Transactions

---

## 参考资源

### 官方文档

- [Jupiter 官方文档](https://station.jup.ag/)
- [Jupiter API 文档](https://station.jup.ag/docs/swap-api/getting-started)
- [Solana 文档](https://docs.solana.com/)

### 代码示例

- [Jupiter SDK](https://github.com/jup-ag/jupiter-sdk)
- [Solana Web3.js](https://solana-labs.github.io/solana-web3.js/)

### 社区资源

- [Jupiter Discord](https://discord.gg/jup)
- [Solana Discord](https://discord.gg/solana)

---

## 更新日志

### v1.0.0 (2026-02-26)

- ✅ 初始版本发布
- ✅ JupiterClient 实现
- ✅ OrderManager 实现
- ✅ 完整的测试套件
- ✅ 详细的文档

---

**最后更新**: 2026-02-26 17:30 UTC  
**维护者**: NeedleBot AI CTO  
**状态**: ✅ 生产就绪
