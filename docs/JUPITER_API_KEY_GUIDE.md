# Jupiter API 密钥获取指南

## 概述

Jupiter API 需要 `x-api-key` 请求头进行认证。本指南将指导您如何获取免费的 Jupiter API 密钥。

## 步骤 1: 访问 Jupiter Portal

1. 打开浏览器，访问: [https://portal.jup.ag](https://portal.jup.ag)
2. 点击 "Get Started" 或 "Sign Up" 按钮

## 步骤 2: 创建账户

1. **连接钱包** (推荐):
   - 点击 "Connect Wallet" 按钮
   - 选择您的钱包 (Phantom, Solflare, Backpack 等)
   - 授权连接

2. **或使用邮箱注册**:
   - 点击 "Sign up with email"
   - 输入您的邮箱地址
   - 检查邮箱中的验证链接
   - 完成注册

## 步骤 3: 生成 API 密钥

1. 登录后，导航到 **API Keys** 部分
2. 点击 **"Create New API Key"** 按钮
3. 填写信息:
   - **Name**: 为您的密钥命名 (例如: "NeedleBot AI Trading")
   - **Description**: 可选描述 (例如: "用于 NeedleBot AI 交易系统的 Jupiter API 集成")
   - **Rate Limit**: 选择免费层 (通常为 60 RPM)
4. 点击 **"Create"** 按钮

## 步骤 4: 复制 API 密钥

1. 创建成功后，您将看到您的 API 密钥
2. **重要**: 立即复制并保存密钥
   - Jupiter 只显示一次完整的 API 密钥
   - 如果丢失，需要重新生成
3. 密钥格式通常为: `jup_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

## 步骤 5: 配置 NeedleBot 项目

1. 编辑配置文件:
   ```bash
   nano /root/.openclaw/workspace/needlebot-improved/config/jupiter-config.json
   ```

2. 将您的 API 密钥添加到配置中:
   ```json
   {
     "apiKey": "jup_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
     "baseUrl": "https://api.jup.ag",
     "version": "v6",
     "defaultSlippageBps": 50,
     // ... 其他配置保持不变
   }
   ```

3. 保存文件

## 步骤 6: 测试 API 密钥

运行测试脚本验证配置:

```bash
cd /root/.openclaw/workspace/needlebot-improved
node test/test-jupiter-with-key.js
```

预期输出:
```
✅ JupiterClient 初始化成功
✅ 获取到 XXXX 个代币
✅ 报价获取成功
✅ API 连接成功
```

## 免费层限制

| 限制项 | 免费层限制 |
|--------|------------|
| 请求速率 | 60 RPM (每分钟60次请求) |
| 并发请求 | 10 |
| 支持的端点 | 所有公共端点 |
| 数据保留 | 30天历史数据 |

## 故障排除

### 常见问题 1: 401 Unauthorized 错误
**症状**: API 返回 `{"code":401,"message":"Unauthorized"}`
**解决方案**:
1. 确认 API 密钥已正确配置
2. 检查密钥是否过期或被撤销
3. 重新生成新的 API 密钥

### 常见问题 2: 429 Too Many Requests 错误
**症状**: API 返回 `{"code":429,"message":"Rate limit exceeded"}`
**解决方案**:
1. 降低请求频率
2. 实现请求缓存
3. 考虑升级到付费层

### 常见问题 3: 密钥不显示
**症状**: 创建密钥后看不到完整密钥
**解决方案**:
1. 检查邮箱垃圾邮件文件夹
2. 在 Portal 的 API Keys 页面查看
3. 如果确实丢失，删除并重新创建

## 安全最佳实践

1. **不要硬编码密钥**: 始终使用配置文件
2. **限制访问权限**: 配置文件应设置为 `600` 权限
   ```bash
   chmod 600 config/jupiter-config.json
   ```
3. **定期轮换密钥**: 每3-6个月更换一次 API 密钥
4. **监控使用情况**: 定期检查 API 使用统计
5. **使用环境变量** (可选):
   ```bash
   export JUPITER_API_KEY="jup_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
   ```

## 升级到付费层

如果需要更高的限制，可以考虑升级:

1. 访问 [portal.jup.ag](https://portal.jup.ag)
2. 导航到 **Billing** 或 **Upgrade** 部分
3. 选择适合的计划:
   - **Starter**: 更高的速率限制
   - **Pro**: 企业级功能
   - **Enterprise**: 定制解决方案

## 支持与资源

- **官方文档**: [https://docs.jup.ag](https://docs.jup.ag)
- **API 参考**: [https://station.jup.ag/docs/swap-api](https://station.jup.ag/docs/swap-api)
- **Discord 社区**: [https://discord.gg/jup](https://discord.gg/jup)
- **GitHub**: [https://github.com/jup-ag](https://github.com/jup-ag)

## 下一步

成功配置 API 密钥后，您可以:

1. 运行完整的 Jupiter API 集成测试
2. 将 Jupiter 集成到 NeedleBot 交易系统
3. 开始模拟交易测试
4. 准备真实交易环境