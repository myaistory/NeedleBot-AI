# QuickNode RPC 配置指南

## 🎯 获取正确的 QuickNode RPC URL

您提供的 `QN_96c3e3c8026243a2ab3f2ac94ec5efdd` 是 QuickNode 的 API 令牌，但不是完整的 RPC URL。

### **正确的 QuickNode RPC URL 格式**

```
https://{endpoint-name}.solana-mainnet.quicknode.com/{your-token}
```

**示例**:
```
https://example.solana-mainnet.quicknode.com/QN_96c3e3c8026243a2ab3f2ac94ec5efdd
```

### **获取完整 RPC URL 的步骤**

#### **步骤 1: 登录 QuickNode 控制台**
1. 访问: https://dashboard.quicknode.com
2. 使用您的账户登录

#### **步骤 2: 找到您的端点**
1. 在控制台左侧菜单点击 **"Endpoints"**
2. 找到您的 Solana 主网端点
3. 点击端点名称进入详情页

#### **步骤 3: 获取 RPC URL**
在端点详情页，您会看到:
- **HTTP URL**: `https://{endpoint-name}.solana-mainnet.quicknode.com/{token}`
- **WebSocket URL**: `wss://{endpoint-name}.solana-mainnet.quicknode.com/{token}`

#### **步骤 4: 复制完整的 URL**
复制完整的 HTTP URL，格式应该类似:
```
https://frosty-spring-smoke.solana-mainnet.quicknode.com/QN_96c3e3c8026243a2ab3f2ac94ec5efdd
```

## 🔧 配置 NeedleBot AI 使用 QuickNode

### **1. 更新配置文件**
编辑 `config/solana-rpc-config.json`:

```json
{
  "name": "quicknode-premium",
  "url": "https://YOUR_ENDPOINT_NAME.solana-mainnet.quicknode.com/QN_96c3e3c8026243a2ab3f2ac94ec5efdd",
  "weight": 40,
  "type": "premium",
  "provider": "quicknode"
}
```

将 `YOUR_ENDPOINT_NAME` 替换为您的端点名称。

### **2. 测试连接**
运行测试脚本验证连接:

```bash
node test-quicknode-connection.js
```

### **3. 验证功能**
测试脚本会检查:
- ✅ 基本 RPC 连接
- ✅ WebSocket 支持
- ✅ 账户查询
- ✅ 交易发送
- ✅ 性能指标

## 📊 QuickNode 功能特性

### **付费节点优势**
1. **高可用性**: 99.9% SLA
2. **低延迟**: 全球多个数据中心
3. **高速率限制**: 比公共节点更高的请求限制
4. **WebSocket 支持**: 实时数据推送
5. **归档数据**: 完整的历史数据访问
6. **增强 API**: 额外的查询功能

### **推荐配置**
```json
{
  "quicknode": {
    "rpc_url": "您的完整 RPC URL",
    "ws_url": "对应的 WebSocket URL",
    "features": ["archive", "enhanced", "priority"],
    "rate_limit": "高"
  }
}
```

## 🚀 性能优化建议

### **1. 连接池配置**
```javascript
const connection = new Connection(quicknodeUrl, {
  commitment: 'confirmed',
  wsEndpoint: quicknodeWsUrl,
  disableRetryOnRateLimit: false,
  confirmTransactionInitialTimeout: 60000
});
```

### **2. 请求优化**
- 使用批量查询 (`getMultipleAccountsInfo`)
- 启用请求缓存
- 合理设置超时时间
- 监控速率限制

### **3. 故障转移配置**
即使使用付费节点，也建议配置备用节点:

```json
{
  "primary": "quicknode-premium",
  "backups": [
    "helius-premium",
    "triton-public",
    "solana-public"
  ]
}
```

## ⚠️ 常见问题解决

### **问题 1: 连接失败**
**症状**: `getaddrinfo ENOTFOUND` 或连接超时

**解决**:
1. 检查端点名称是否正确
2. 验证 API 令牌是否有效
3. 检查网络连接和防火墙
4. 确认 QuickNode 账户状态

### **问题 2: 速率限制**
**症状**: `429 Too Many Requests` 错误

**解决**:
1. 降低请求频率
2. 实现请求队列
3. 使用批量查询减少请求数
4. 考虑升级 QuickNode 套餐

### **问题 3: WebSocket 断开**
**症状**: WebSocket 连接频繁断开

**解决**:
1. 实现自动重连逻辑
2. 增加心跳检测
3. 检查网络稳定性
4. 使用更稳定的连接参数

## 💰 成本管理

### **QuickNode 定价**
- **免费层**: 有限制的请求
- **增长层**: $9-49/月
- **商业层**: $99+/月
- **企业层**: 定制价格

### **成本优化策略**
1. **监控使用量**: 定期检查请求统计
2. **缓存结果**: 减少重复查询
3. **批量操作**: 合并多个请求
4. **智能重试**: 避免不必要的重试

## 🔐 安全最佳实践

### **1. 保护 API 令牌**
- 不要将令牌提交到版本控制
- 使用环境变量存储
- 定期轮换令牌
- 限制令牌权限

### **2. 访问控制**
- 使用 IP 白名单
- 设置速率限制
- 监控异常访问
- 启用访问日志

### **3. 数据安全**
- 加密敏感数据
- 安全存储私钥
- 定期备份配置
- 审计日志记录

## 📈 监控和告警

### **建议监控指标**
1. **连接状态**: 成功率、延迟
2. **请求统计**: 总量、错误率
3. **速率限制**: 使用率、限制状态
4. **性能指标**: TPS、确认时间

### **告警设置**
```javascript
const alerts = {
  high_latency: { threshold: 2000 }, // 2秒
  low_success_rate: { threshold: 0.9 }, // 90%
  high_error_rate: { threshold: 0.1 }, // 10%
  rate_limit_warning: { threshold: 0.8 } // 80% 限制
};
```

## 🎯 下一步行动

### **立即行动**
1. ✅ 获取完整的 QuickNode RPC URL
2. 🔄 更新配置文件
3. 🔄 测试连接
4. 🔄 集成到 NeedleBot AI

### **长期优化**
1. 性能基准测试
2. 成本效益分析
3. 多节点负载均衡
4. 自动故障转移

## 📞 支持资源

### **QuickNode 官方资源**
- 文档: https://docs.quicknode.com
- 控制台: https://dashboard.quicknode.com
- 支持: https://help.quicknode.com

### **NeedleBot AI 支持**
- 配置文件: `config/solana-rpc-config.json`
- 测试脚本: `test-quicknode-connection.js`
- 问题反馈: 通过 OpenClaw 会话

---

**最后更新**: 2026-02-25 09:00 UTC  
**状态**: 等待正确的 QuickNode RPC URL  
**建议**: 使用公共节点进行初步测试，获取正确 URL 后切换到 QuickNode