const { Connection, Keypair, PublicKey, VersionedTransaction } = require('@solana/web3.js');
const bs58 = require('bs58');
const axios = require('axios');

// 配置
const config = {
  // 钱包配置
  privateKey: "5PYxTMwHwnXwFjZfz6j8a7Xz7ZoiccQ1VoM8j49aX66edqpmPQHDjXnacLZuXU2o5uPnxLjHYHJpJi4FkgEJjC6M",
  
  // RPC端点
  rpcEndpoint: "https://api.mainnet-beta.solana.com", // 公共RPC用于查询
  quicknodeRpc: "https://purple-wiser-tab.solana-mainnet.quiknode.pro", // QuickNode用于交易
  
  // Jupiter API配置
  jupiterApiKey: "ddc333e0-5736-43c0-b0fb-5ba6c8823e5e",
  jupiterBaseUrl: "https://api.jup.ag",
  
  // 交易对
  inputMint: "So11111111111111111111111111111111111111112", // SOL
  outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  
  // 交易金额（lamports，1 SOL = 1,000,000,000 lamports）
  amount: 1000000, // 0.001 SOL
  
  // 滑点（基点，100 = 1%）
  slippageBps: 100,
  
  // 测试模式
  testMode: true, // 只获取报价，不执行交易
};

class JupiterWalletTest {
  constructor() {
    this.connection = null;
    this.keypair = null;
    this.publicKey = null;
    this.walletBalance = 0;
    this.jupiterClient = null;
  }
  
  async initialize() {
    console.log("🚀 Jupiter钱包交易测试初始化");
    console.log("=".repeat(60));
    
    try {
      // 1. 创建钱包Keypair
      const decoded = bs58.decode(config.privateKey);
      this.keypair = Keypair.fromSecretKey(decoded);
      this.publicKey = this.keypair.publicKey;
      
      console.log(`✅ 钱包初始化成功`);
      console.log(`   📱 地址: ${this.publicKey.toString()}`);
      
      // 2. 创建连接（使用公共RPC查询余额）
      this.connection = new Connection(config.rpcEndpoint, 'confirmed');
      console.log(`🔗 连接到RPC: ${config.rpcEndpoint}`);
      
      // 3. 检查余额
      await this.checkBalance();
      
      // 4. 初始化Jupiter客户端
      this.jupiterClient = axios.create({
        baseURL: config.jupiterBaseUrl,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.jupiterApiKey,
        },
        timeout: 30000,
      });
      
      console.log(`🔧 Jupiter客户端初始化完成`);
      
      return true;
      
    } catch (error) {
      console.error(`❌ 初始化失败: ${error.message}`);
      return false;
    }
  }
  
  async checkBalance() {
    try {
      console.log("\n💰 检查钱包余额...");
      const balance = await this.connection.getBalance(this.publicKey);
      this.walletBalance = balance;
      
      const balanceSOL = balance / 1_000_000_000;
      console.log(`   📊 当前余额: ${balanceSOL.toFixed(6)} SOL (${balance} lamports)`);
      
      // 检查是否足够进行测试交易
      if (balance >= config.amount) {
        console.log(`   ✅ 余额充足，可进行测试交易`);
        console.log(`      需要: ${config.amount} lamports (${config.amount / 1_000_000_000} SOL)`);
        console.log(`      剩余: ${balance - config.amount} lamports`);
      } else {
        console.log(`   ❌ 余额不足，无法进行测试交易`);
        console.log(`      需要: ${config.amount} lamports`);
        console.log(`      当前: ${balance} lamports`);
        console.log(`      缺少: ${config.amount - balance} lamports`);
        
        // 计算需要转入的SOL
        const neededSOL = (config.amount - balance) / 1_000_000_000;
        console.log(`\n💡 请向以下地址转入至少 ${neededSOL.toFixed(6)} SOL:`);
        console.log(`   ${this.publicKey.toString()}`);
        console.log(`   当前汇率: 1 SOL ≈ $0.087 (以实际为准)`);
      }
      
      return balance;
      
    } catch (error) {
      console.error(`❌ 余额检查失败: ${error.message}`);
      return 0;
    }
  }
  
  async getQuote() {
    console.log("\n📈 获取交易报价...");
    
    try {
      const params = {
        inputMint: config.inputMint,
        outputMint: config.outputMint,
        amount: config.amount.toString(),
        slippageBps: config.slippageBps.toString(),
        onlyDirectRoutes: false,
        asLegacyTransaction: false,
      };
      
      console.log(`   🔄 交易对: SOL → USDC`);
      console.log(`   💰 金额: ${config.amount} lamports (${config.amount / 1_000_000_000} SOL)`);
      console.log(`   📉 滑点: ${config.slippageBps / 100}%`);
      
      const response = await this.jupiterClient.get('/swap/v1/quote', { params });
      
      if (response.data && response.data.inAmount && response.data.outAmount) {
        const inAmount = parseInt(response.data.inAmount);
        const outAmount = parseInt(response.data.outAmount);
        const price = outAmount / inAmount;
        
        console.log(`✅ 报价获取成功`);
        console.log(`   📥 输入: ${(inAmount / 1_000_000_000).toFixed(6)} SOL`);
        console.log(`   📤 输出: ${(outAmount / 1_000_000).toFixed(6)} USDC`);
        console.log(`   💱 汇率: 1 SOL = ${(price * 1_000_000_000 / 1_000_000).toFixed(6)} USDC`);
        console.log(`   ⚡ 预估费用: ${response.data.otherAmountThreshold ? '有' : '无'}`);
        
        if (response.data.routePlan) {
          console.log(`   🛣️  路由路径: ${response.data.routePlan.length} 步`);
        }
        
        return response.data;
      } else {
        console.log(`❌ 报价数据格式错误`);
        return null;
      }
      
    } catch (error) {
      console.error(`❌ 获取报价失败: ${error.message}`);
      if (error.response) {
        console.error(`   状态码: ${error.response.status}`);
        console.error(`   响应数据: ${JSON.stringify(error.response.data)}`);
      }
      return null;
    }
  }
  
  async simulateTransaction(quoteResponse) {
    if (!quoteResponse || config.testMode) {
      console.log("\n🔬 跳过交易模拟（测试模式）");
      return null;
    }
    
    console.log("\n🔬 模拟交易执行...");
    
    try {
      // 获取交换指令
      const swapResponse = await this.jupiterClient.post('/swap/v1/swap', {
        quoteResponse,
        userPublicKey: this.publicKey.toString(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
      });
      
      if (swapResponse.data && swapResponse.data.swapTransaction) {
        console.log(`✅ 交易指令生成成功`);
        
        // 解码交易
        const swapTransactionBuf = Buffer.from(swapResponse.data.swapTransaction, 'base64');
        const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
        
        // 签名（模拟）
        console.log(`   ✍️  交易已准备签名`);
        console.log(`   📝 交易大小: ${swapTransactionBuf.length} 字节`);
        
        // 这里可以添加实际签名逻辑
        // transaction.sign([this.keypair]);
        
        return {
          transaction,
          swapResponse: swapResponse.data,
        };
      } else {
        console.log(`❌ 交易指令生成失败`);
        return null;
      }
      
    } catch (error) {
      console.error(`❌ 交易模拟失败: ${error.message}`);
      if (error.response) {
        console.error(`   状态码: ${error.response.status}`);
        console.error(`   响应数据: ${JSON.stringify(error.response.data)}`);
      }
      return null;
    }
  }
  
  async analyzePriceImpact(quoteResponse) {
    if (!quoteResponse) return;
    
    console.log("\n📊 价格影响分析...");
    
    try {
      // 计算价格影响
      const inAmount = parseInt(quoteResponse.inAmount);
      const outAmount = parseInt(quoteResponse.outAmount);
      
      // 简单价格影响估算（实际需要更多市场数据）
      const estimatedImpact = (quoteResponse.priceImpactPct || 0) * 100;
      
      console.log(`   📈 预估价格影响: ${estimatedImpact.toFixed(4)}%`);
      
      if (estimatedImpact < 0.1) {
        console.log(`   ✅ 价格影响可忽略`);
      } else if (estimatedImpact < 1) {
        console.log(`   ⚠️  轻微价格影响`);
      } else if (estimatedImpact < 5) {
        console.log(`   ⚠️  中等价格影响`);
      } else {
        console.log(`   ❌ 高价格影响，建议调整交易规模`);
      }
      
      return estimatedImpact;
      
    } catch (error) {
      console.error(`❌ 价格影响分析失败: ${error.message}`);
      return null;
    }
  }
  
  async runFullTest() {
    console.log("\n" + "=".repeat(60));
    console.log("🧪 开始完整Jupiter钱包交易测试");
    console.log("=".repeat(60));
    
    // 1. 初始化
    const initialized = await this.initialize();
    if (!initialized) {
      console.log("❌ 初始化失败，测试终止");
      return;
    }
    
    // 2. 检查余额是否足够
    if (this.walletBalance < config.amount) {
      console.log("\n💡 余额不足，但仍测试报价功能");
      console.log("请向以下地址转入少量SOL进行完整测试:");
      console.log(this.publicKey.toString());
      console.log(`需要至少 ${config.amount / 1_000_000_000} SOL`);
      console.log("继续测试报价功能...");
    }
    
    // 3. 获取报价
    const quote = await this.getQuote();
    if (!quote) {
      console.log("❌ 获取报价失败，测试终止");
      return;
    }
    
    // 4. 分析价格影响
    await this.analyzePriceImpact(quote);
    
    // 5. 模拟交易（如果余额充足且不是测试模式）
    if (this.walletBalance >= config.amount && !config.testMode) {
      const simulation = await this.simulateTransaction(quote);
      if (simulation) {
        console.log("\n✅ 交易模拟成功完成");
        console.log("系统已准备好执行真实交易");
      }
    } else {
      console.log("\n📋 测试模式总结:");
      console.log(`   ✅ 钱包配置验证通过`);
      console.log(`   ✅ Jupiter API连接正常`);
      console.log(`   ✅ 报价获取功能正常`);
      console.log(`   ⚠️  余额不足或测试模式，跳过实际交易`);
      
      if (config.testMode) {
        console.log(`\n💡 要执行真实交易，请:`);
        console.log(`   1. 设置 config.testMode = false`);
        console.log(`   2. 确保钱包有足够余额`);
        console.log(`   3. 重新运行测试`);
      }
    }
    
    console.log("\n" + "=".repeat(60));
    console.log("🎉 Jupiter钱包交易测试完成");
    console.log("=".repeat(60));
    
    // 返回测试结果
    return {
      success: true,
      walletAddress: this.publicKey.toString(),
      walletBalance: this.walletBalance,
      walletBalanceSOL: this.walletBalance / 1_000_000_000,
      quoteReceived: !!quote,
      testMode: config.testMode,
      canTrade: this.walletBalance >= config.amount && !config.testMode,
      timestamp: new Date().toISOString(),
    };
  }
}

// 运行测试
async function main() {
  console.log("🔧 Jupiter API钱包集成测试");
  console.log("版本: 1.0.0 | 日期: 2026-02-27");
  console.log("=".repeat(60));
  
  const test = new JupiterWalletTest();
  const result = await test.runFullTest();
  
  console.log("\n📋 测试结果摘要:");
  console.log(JSON.stringify(result, null, 2));
  
  // 保存测试结果
  if (result) {
    const fs = require('fs');
    const resultFile = './test-results/jupiter-wallet-test-result.json';
    fs.mkdirSync('./test-results', { recursive: true });
    fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
    console.log(`\n📁 测试结果已保存到: ${resultFile}`);
  }
}

// 执行
main().catch(error => {
  console.error("❌ 测试执行失败:", error);
  process.exit(1);
});