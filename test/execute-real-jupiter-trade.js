const { Connection, Keypair, VersionedTransaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const bs58 = require('bs58');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// 配置
const config = {
  // 钱包配置
  privateKey: "5PYxTMwHwnXwFjZfz6j8a7Xz7ZoiccQ1VoM8j49aX66edqpmPQHDjXnacLZuXU2o5uPnxLjHYHJpJi4FkgEJjC6M",
  
  // RPC端点
  rpcEndpoint: "https://purple-wiser-tab.solana-mainnet.quiknode.pro/5e15144ae8962f5d2dae5d8d9f4bb722fd65156a", // QuickNode用于交易
  
  // Jupiter API配置
  jupiterApiKey: "ddc333e0-5736-43c0-b0fb-5ba6c8823e5e",
  jupiterBaseUrl: "https://api.jup.ag",
  
  // 交易对
  inputMint: "So11111111111111111111111111111111111111112", // SOL
  outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  
  // 交易金额（lamports，1 SOL = 1,000,000,000 lamports）
  amount: 1000000, // 0.001 SOL（约$0.083）
  
  // 滑点（基点，100 = 1%）
  slippageBps: 200, // 2%滑点，确保交易成功
  
  // 测试模式
  testMode: false, // 执行真实交易
  
  // 日志文件
  logDir: "./trade-logs",
};

class RealJupiterTrade {
  constructor() {
    this.connection = null;
    this.keypair = null;
    this.publicKey = null;
    this.walletBalance = 0;
    this.jupiterClient = null;
    this.tradeId = `TRADE-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    this.tradeLog = {
      tradeId: this.tradeId,
      timestamp: new Date().toISOString(),
      walletAddress: "",
      status: "initializing",
      steps: [],
      errors: [],
      result: null,
    };
  }
  
  async logStep(step, details) {
    const stepLog = {
      step,
      timestamp: new Date().toISOString(),
      details,
    };
    this.tradeLog.steps.push(stepLog);
    console.log(`[${new Date().toLocaleTimeString()}] ${step}: ${JSON.stringify(details)}`);
  }
  
  async saveLog() {
    try {
      await fs.mkdir(config.logDir, { recursive: true });
      const logFile = path.join(config.logDir, `${this.tradeId}.json`);
      await fs.writeFile(logFile, JSON.stringify(this.tradeLog, null, 2));
      this.logStep("LOG_SAVED", { file: logFile });
      return logFile;
    } catch (error) {
      console.error("保存日志失败:", error);
      return null;
    }
  }
  
  async initialize() {
    this.logStep("INITIALIZE", { action: "开始初始化" });
    
    try {
      // 1. 创建钱包Keypair
      const decoded = bs58.decode(config.privateKey);
      this.keypair = Keypair.fromSecretKey(decoded);
      this.publicKey = this.keypair.publicKey;
      this.tradeLog.walletAddress = this.publicKey.toString();
      
      this.logStep("WALLET_CREATED", { 
        address: this.publicKey.toString(),
        keyLength: config.privateKey.length 
      });
      
      // 2. 创建连接
      this.connection = new Connection(config.rpcEndpoint, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 60000,
      });
      
      this.logStep("CONNECTION_CREATED", { 
        rpcEndpoint: config.rpcEndpoint,
        commitment: 'confirmed' 
      });
      
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
      
      this.logStep("JUPITER_CLIENT_INITIALIZED", { 
        baseUrl: config.jupiterBaseUrl,
        hasApiKey: !!config.jupiterApiKey 
      });
      
      this.tradeLog.status = "initialized";
      return true;
      
    } catch (error) {
      this.logStep("INITIALIZATION_ERROR", { error: error.message });
      this.tradeLog.errors.push({ step: "initialize", error: error.message });
      this.tradeLog.status = "failed";
      return false;
    }
  }
  
  async checkBalance() {
    this.logStep("CHECK_BALANCE_START", {});
    
    try {
      const balance = await this.connection.getBalance(this.publicKey);
      this.walletBalance = balance;
      
      const balanceSOL = balance / 1_000_000_000;
      const neededSOL = config.amount / 1_000_000_000;
      
      this.logStep("BALANCE_CHECKED", {
        balanceSOL: balanceSOL.toFixed(6),
        balanceLamports: balance,
        neededSOL: neededSOL.toFixed(6),
        neededLamports: config.amount,
        hasEnough: balance >= config.amount
      });
      
      if (balance < config.amount) {
        const errorMsg = `余额不足: 需要 ${neededSOL} SOL，当前 ${balanceSOL} SOL`;
        this.logStep("INSUFFICIENT_BALANCE", { error: errorMsg });
        throw new Error(errorMsg);
      }
      
      return balance;
      
    } catch (error) {
      this.logStep("BALANCE_CHECK_ERROR", { error: error.message });
      this.tradeLog.errors.push({ step: "checkBalance", error: error.message });
      throw error;
    }
  }
  
  async getQuote() {
    this.logStep("GET_QUOTE_START", {
      inputMint: config.inputMint,
      outputMint: config.outputMint,
      amount: config.amount,
      slippageBps: config.slippageBps
    });
    
    try {
      const params = {
        inputMint: config.inputMint,
        outputMint: config.outputMint,
        amount: config.amount.toString(),
        slippageBps: config.slippageBps.toString(),
        onlyDirectRoutes: false,
        asLegacyTransaction: false,
        maxAccounts: 20,
      };
      
      const response = await this.jupiterClient.get('/swap/v1/quote', { params });
      
      if (!response.data || !response.data.inAmount || !response.data.outAmount) {
        throw new Error("报价响应数据格式错误");
      }
      
      const inAmount = parseInt(response.data.inAmount);
      const outAmount = parseInt(response.data.outAmount);
      const price = outAmount / inAmount;
      const priceImpact = response.data.priceImpactPct || 0;
      
      this.logStep("QUOTE_RECEIVED", {
        inAmount,
        outAmount,
        inAmountSOL: (inAmount / 1_000_000_000).toFixed(6),
        outAmountUSDC: (outAmount / 1_000_000).toFixed(6),
        exchangeRate: (price * 1_000_000_000 / 1_000_000).toFixed(6),
        priceImpactPercent: (priceImpact * 100).toFixed(4),
        routePlanSteps: response.data.routePlan?.length || 0,
        quoteId: response.data.quoteId || "unknown"
      });
      
      return response.data;
      
    } catch (error) {
      this.logStep("GET_QUOTE_ERROR", { 
        error: error.message,
        response: error.response?.data 
      });
      this.tradeLog.errors.push({ step: "getQuote", error: error.message });
      throw error;
    }
  }
  
  async executeTrade(quoteResponse) {
    this.logStep("EXECUTE_TRADE_START", {
      quoteId: quoteResponse.quoteId || "unknown",
      testMode: config.testMode
    });
    
    if (config.testMode) {
      this.logStep("TEST_MODE_SKIP", { action: "测试模式，跳过真实交易" });
      this.tradeLog.status = "test_mode_skipped";
      return { simulated: true, success: true };
    }
    
    try {
      // 1. 获取交换交易
      this.logStep("GET_SWAP_TRANSACTION", {});
      
      const swapResponse = await this.jupiterClient.post('/swap/v1/swap', {
        quoteResponse,
        userPublicKey: this.publicKey.toString(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 10000, // 小额优先费
      });
      
      if (!swapResponse.data || !swapResponse.data.swapTransaction) {
        throw new Error("交换交易数据格式错误");
      }
      
      this.logStep("SWAP_TRANSACTION_RECEIVED", {
        transactionSize: swapResponse.data.swapTransaction.length,
        hasComputeUnits: !!swapResponse.data.computeUnits,
        hasPrioritizationFee: !!swapResponse.data.prioritizationFee
      });
      
      // 2. 解码和签名交易
      this.logStep("DECODE_TRANSACTION", {});
      
      const swapTransactionBuf = Buffer.from(swapResponse.data.swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
      
      // 签名交易
      transaction.sign([this.keypair]);
      
      this.logStep("TRANSACTION_SIGNED", {
        signatures: transaction.signatures.length,
        messageSize: transaction.message.serialize().length
      });
      
      // 3. 发送交易
      this.logStep("SEND_TRANSACTION", {});
      
      const signature = await this.connection.sendTransaction(transaction, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      });
      
      this.logStep("TRANSACTION_SENT", {
        signature,
        length: signature.length
      });
      
      // 4. 确认交易
      this.logStep("CONFIRM_TRANSACTION_START", {
        signature,
        commitment: 'confirmed'
      });
      
      const confirmation = await this.connection.confirmTransaction({
        signature,
        commitment: 'confirmed',
        timeout: 60000,
      });
      
      if (confirmation.value.err) {
        throw new Error(`交易确认失败: ${JSON.stringify(confirmation.value.err)}`);
      }
      
      this.logStep("TRANSACTION_CONFIRMED", {
        signature,
        slot: confirmation.value.slot,
        confirmationStatus: 'confirmed'
      });
      
      // 5. 获取交易详情
      this.logStep("GET_TRANSACTION_DETAILS", { signature });
      
      const transactionDetails = await this.connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      
      this.logStep("TRANSACTION_DETAILS_RECEIVED", {
        slot: transactionDetails?.slot,
        fee: transactionDetails?.meta?.fee,
        status: transactionDetails?.meta?.err ? 'failed' : 'success'
      });
      
      const result = {
        success: true,
        signature,
        slot: confirmation.value.slot,
        transactionDetails,
        quoteId: quoteResponse.quoteId,
        timestamp: new Date().toISOString(),
      };
      
      this.tradeLog.result = result;
      this.tradeLog.status = "completed";
      
      return result;
      
    } catch (error) {
      this.logStep("EXECUTE_TRADE_ERROR", { error: error.message });
      this.tradeLog.errors.push({ step: "executeTrade", error: error.message });
      this.tradeLog.status = "failed";
      throw error;
    }
  }
  
  async verifyTradeResult(signature) {
    this.logStep("VERIFY_TRADE_START", { signature });
    
    try {
      // 等待几秒让交易完全确认
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // 获取交易详情
      const transaction = await this.connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      
      if (!transaction) {
        throw new Error("无法获取交易详情");
      }
      
      // 检查交易状态
      const status = transaction.meta?.err ? 'failed' : 'success';
      const fee = transaction.meta?.fee || 0;
      
      // 获取新的余额
      const newBalance = await this.connection.getBalance(this.publicKey);
      const balanceChange = this.walletBalance - newBalance;
      
      this.logStep("TRADE_VERIFIED", {
        status,
        fee,
        feeSOL: (fee / 1_000_000_000).toFixed(6),
        oldBalance: this.walletBalance,
        newBalance,
        balanceChange,
        balanceChangeSOL: (balanceChange / 1_000_000_000).toFixed(6),
        slot: transaction.slot,
        timestamp: new Date(transaction.blockTime * 1000).toISOString()
      });
      
      return {
        verified: true,
        status,
        fee,
        balanceChange,
        transaction,
      };
      
    } catch (error) {
      this.logStep("VERIFY_TRADE_ERROR", { error: error.message });
      return {
        verified: false,
        error: error.message,
      };
    }
  }
  
  async runTrade() {
    console.log("=".repeat(70));
    console.log("🚀 开始真实Jupiter交易测试");
    console.log(`交易ID: ${this.tradeId}`);
    console.log(`钱包地址: ${this.publicKey?.toString() || '待初始化'}`);
    console.log(`交易金额: ${config.amount / 1_000_000_000} SOL`);
    console.log("=".repeat(70));
    
    try {
      // 1. 初始化
      const initialized = await this.initialize();
      if (!initialized) {
        throw new Error("初始化失败");
      }
      
      // 2. 获取报价
      const quote = await this.getQuote();
      if (!quote) {
        throw new Error("获取报价失败");
      }
      
      // 3. 执行交易
      const tradeResult = await this.executeTrade(quote);
      
      // 4. 验证交易结果
      if (tradeResult.signature) {
        await this.verifyTradeResult(tradeResult.signature);
      }
      
      // 5. 保存日志
      const logFile = await this.saveLog();
      
      console.log("\n" + "=".repeat(70));
      console.log("🎉 交易测试完成!");
      console.log("=".repeat(70));
      
      const summary = {
        tradeId: this.tradeId,
        status: this.tradeLog.status,
        wallet: this.publicKey.toString(),
        amount: `${config.amount / 1_000_000_000} SOL`,
        tradeResult: tradeResult.signature ? `成功: ${tradeResult.signature}` : "模拟模式",
        logFile,
        timestamp: new Date().toISOString(),
      };
      
      console.log(JSON.stringify(summary, null, 2));
      
      return summary;
      
    } catch (error) {
      console.error("\n❌ 交易测试失败:", error.message);
      
      // 保存错误日志
      await this.saveLog();
      
      const errorSummary = {
        tradeId: this.tradeId,
        status: "failed",
        error: error.message,
        steps: this.tradeLog.steps.length,
        errors: this.tradeLog.errors.length,
        logFile: await this.saveLog(),
        timestamp: new Date().toISOString(),
      };
      
      console.log(JSON.stringify(errorSummary, null, 2));
      
      throw error;
    }
  }
}

// 运行交易
async function main() {
  console.log("🔧 NeedleBot AI - 真实Jupiter交易测试");
  console.log("版本: 1.0.0 | 日期: 2026-02-27");
  console.log("注意: 这将执行真实链上交易!");
  console.log("=".repeat(70));
  
  // 确认用户意图
  console.log("\n⚠️ 重要确认:");
  console.log(`1. 钱包地址: 2LhAWAWRzt5cGv7qWq1md4S2mvoxTmKSVxTEEuuq9ei5`);
  console.log(`2. 交易金额: ${config.amount / 1_000_000_000} SOL (约 $${(config.amount / 1_000_000_000 * 83.5).toFixed(3)})`);
  console.log(`3. 滑点设置: ${config.slippageBps / 100}%`);
  console.log(`4. 测试模式: ${config.testMode ? '是 (仅模拟)' : '否 (真实交易)'}`);
  
  // 如果是真实交易，等待用户确认
  if (!config.testMode) {
    console.log("\n🚨 这将执行真实链上交易，消耗真实SOL!");
    console.log("按 Ctrl+C 取消，或等待10秒后继续...");
    
    await new Promise(resolve => setTimeout(resolve, 10000));
    console.log("继续执行真实交易...");
  }
  
  const trade = new RealJupiterTrade();
  
  try {
    const result = await trade.runTrade();
    
    console.log("\n" + "=".repeat(70));
    console.log("📊 交易测试总结");
    console.log("=".repeat(70));
    
    if (result.status === "completed" || result.status === "test_mode_skipped") {
      console.log("✅ 测试成功完成!");
      console.log(`交易ID: ${result.tradeId}`);
      console.log(`钱包: ${result.wallet}`);
      console.log(`金额: ${result.amount}`);
      console.log(`结果: ${result.tradeResult}`);
      console.log(`日志文件: ${result.logFile}`);
      
      if (!config.testMode && result.tradeResult && result.tradeResult.includes("成功:")) {
        const signature = result.tradeResult.split("成功: ")[1];
        console.log(`\n🔗 交易查看链接:`);
        console.log(`https://solscan.io/tx/${signature}`);
        console.log(`https://explorer.solana.com/tx/${signature}`);
      }
    } else {
      console.log("❌ 测试失败!");
      console.log(`错误: ${result.error || "未知错误"}`);
    }
    
  } catch (error) {
    console.error("\n💥 交易执行失败:", error.message);
    process.exit(1);
  }
}

// 执行
main().catch(error => {
  console.error("❌ 脚本执行失败:", error);
  process.exit(1);
});