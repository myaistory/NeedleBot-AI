# Meme信号捕获升级方案 V5.2

## 📈 升级内容

### 新增功能

| 功能 | 文件 | 状态 |
|------|------|------|
| 新币自动发现 | `meme-scanner.js` | ✅ |
| 实时WebSocket | `meme-scanner-realtime.js` | ✅ |
| 多源数据投票 | `meme-scanner.js` | ✅ |

---

## 🚀 新增模块

### 1. MemeSignalCapture (meme-scanner.js)

```javascript
const scanner = new MemeSignalCapture();

// 启动扫描
scanner.start();

// 获取统计
scanner.getStats();
```

**功能：**
- ✅ 自动扫描热门meme币
- ✅ 发现新币自动加入监控
- ✅ 多数据源合并（投票机制）
- ✅ 智能信号过滤

### 2. MemeScannerRealtime (meme-scanner-realtime.js)

```javascript
const { MemeScannerRealtime, MemeScannerPolling } = require('./meme-scanner-realtime');

// WebSocket模式
const wsScanner = new MemeScannerRealtime();
await wsScanner.connect();

// 或轮询模式（备用）
const pollingScanner = new MemeScannerPolling();
pollingScanner.startPolling(5000); // 每5秒
```

**功能：**
- ✅ WebSocket实时推送（毫秒级）
- ✅ 自动重连
- ✅ 轮询后备模式

---

## 📊 API端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/meme-scanner` | GET | 获取扫描统计 |
| `/api/meme-scanner/scan` | POST | 手动触发扫描 |

---

## 🔧 使用方法

### 1. 启动扫描

```javascript
const MemeSignalCapture = require('./src/modules/meme-scanner');

const scanner = new MemeSignalCapture();
scanner.start();
```

### 2. 添加自定义代币

```javascript
scanner.knownTokens.add('YOUR_TOKEN_ADDRESS');
```

### 3. 获取信号

```javascript
const signal = await scanner.checkSingleToken(tokenAddress);
if (signal && signal.isSafe) {
    console.log('发现有效信号:', signal);
}
```

---

## 📈 性能对比

| 指标 | V5.1 (旧) | V5.2 (新) |
|------|-----------|-----------|
| 延迟 | 10秒 | <1秒 |
| 监控币种数 | 10个 | 50+个 |
| 新币发现 | 无 | 每30秒 |
| 实时推送 | 无 | WebSocket |

---

## 🔐 安全机制

- 流动性检查 (>$15k)
- 真假插针识别
- 多数据源投票
- 自动黑名单

---

*最后更新: 2026-03-01*
