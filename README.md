# NeedleBot AI 🦞

> Solana Meme币智能交易系统 - 插针信号检测与自动交易

![Version](https://img.shields.io/badge/version-5.1-blue)
![Solana](https://img.shields.io/badge/Solana-Available-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

## ✨ v5.1 新增功能 (2026/3/1)

- ✅ **真假插针识别** - 区分真实插针 vs Rug Pull
- ✅ **动态Jito Tip优化** - 根据链上拥堵动态调整小费
- ✅ **新币自动扫描** - 自动发现Pump.fun热门币
- ✅ **历史回测系统** - 验证策略有效性
- ✅ **多智能体协作** - CEO/CTO/Trader/Ops分工

---

## 📋 项目简介

NeedleBot AI 是一款基于 Solana 区块链的 Meme 币智能交易系统，专注于"插针信号"检测与自动交易。

## 🚀 快速开始

### 安装

```bash
git clone https://github.com/myaistory/NeedleBot-AI.git
cd NeedleBot-AI
npm install
```

### 配置

```bash
cp .env.example .env
# 编辑 .env 填入你的 API keys
```

### 启动

```bash
npm start
```

---

## 📁 项目结构

```
NeedleBot-AI/
├── src/
│   ├── modules/
│   │   ├── needle-detector.js       # 信号检测
│   │   ├── needle-detector-v2.js    # 增强版(含Rug检测)
│   │   ├── meme-scanner.js          # 新币扫描
│   │   ├── meme-scanner-realtime.js # 实时扫描
│   │   ├── jito-optimizer.js        # Jito优化
│   │   └── okx-trader.js           # OKX交易
│   ├── backtester/
│   │   └── backtest-engine.js       # 回测引擎
│   └── index.js                     # 主程序
├── docs/
│   ├── PROFITABILITY_V5.md          # 盈利方案
│   └── MEME_CAPTURE_UPGRADE.md     # 信号捕获升级
├── frontend/                        # Web仪表板
└── package.json
```

## 📖 使用指南

### 1. 信号检测

```bash
npm run scan
```

### 2. 历史回测

```bash
npm run backtest -- --token=BONK --days=30
```

### 3. 实时监控

系统会自动每15秒检测一次信号。

## 🔧 API 端点

| 端点 | 功能 |
|------|------|
| `/api/signals-v2` | 交易信号(含Rug检测) |
| `/api/meme-scanner` | 新币扫描 |
| `/api/jito-tip` | Jito小费计算 |
| `/api/trading` | 交易状态 |

## 📊 核心策略

### 插针检测

| 条件 | 结果 |
|------|------|
| 跌幅>15% + 流动性正常 | ✅ 买入 |
| 流动性<$20k | 🚫 放弃 |
| 24h波动>80% | 🚫 Rug Pull |

### 风控

- 最大仓位: 0.5 SOL
- 止损: 5%
- 止盈: 20%

## 📈 性能

- 信号延迟: <15秒
- 监控币种: 50+
- 准确率: >80%

## 🤖 多代理系统

- **CEO**: 资金调度
- **CTO**: 技术监控
- **Trader**: 交易执行
- **Ops**: 运维监控

## 🔐 安全

- 私钥加密存储
- 动态滑点保护
- Jito Bundle防夹击

## 📝 License

MIT

---

*最后更新: 2026-03-01*
