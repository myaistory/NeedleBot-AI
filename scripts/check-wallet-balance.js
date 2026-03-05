const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');

// 从环境变量或直接使用私钥
const privateKey = process.env.SOLANA_PRIVATE_KEY || "5PYxTMwHwnXwFjZfz6j8a7Xz7ZoiccQ1VoM8j49aX66edqpmPQHDjXnacLZuXU2o5uPnxLjHYHJpJi4FkgEJjC6M";
const rpcEndpoint = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

async function checkWalletBalance() {
  console.log("💰 Solana钱包余额检查");
  console.log("=".repeat(50));
  
  try {
    // 创建连接
    const connection = new Connection(rpcEndpoint, 'confirmed');
    console.log(`🔗 连接到RPC: ${rpcEndpoint}`);
    
    // 创建Keypair
    const decoded = bs58.decode(privateKey);
    const keypair = Keypair.fromSecretKey(decoded);
    const publicKey = keypair.publicKey;
    
    console.log(`📱 钱包地址: ${publicKey.toString()}`);
    console.log(`🔑 私钥格式: Base58 (${privateKey.length} 字符)`);
    
    // 获取余额
    console.log("\n📊 获取余额中...");
    const balanceLamports = await connection.getBalance(publicKey);
    const balanceSOL = balanceLamports / LAMPORTS_PER_SOL;
    
    console.log(`💰 当前余额: ${balanceSOL.toFixed(6)} SOL`);
    console.log(`   (${balanceLamports} lamports)`);
    
    // 检查是否足够进行测试交易
    const testAmount = 0.001; // 0.001 SOL
    if (balanceSOL >= testAmount) {
      console.log(`✅ 余额充足，可进行测试交易 (需要 ${testAmount} SOL)`);
      console.log(`   可用测试次数: ${Math.floor(balanceSOL / testAmount)} 次`);
    } else {
      console.log(`❌ 余额不足，无法进行测试交易`);
      console.log(`   需要至少 ${testAmount} SOL，当前只有 ${balanceSOL.toFixed(6)} SOL`);
      console.log(`   请向钱包地址 ${publicKey.toString()} 转入少量SOL`);
    }
    
    // 获取最近的交易记录
    console.log("\n📋 最近交易记录:");
    try {
      const signatures = await connection.getSignaturesForAddress(publicKey, { limit: 5 });
      if (signatures.length > 0) {
        signatures.forEach((sig, index) => {
          console.log(`   ${index + 1}. ${sig.signature.slice(0, 32)}...`);
          console.log(`      区块: ${sig.slot}, 时间: ${new Date(sig.blockTime * 1000).toLocaleString()}`);
          console.log(`      状态: ${sig.err ? '失败' : '成功'}`);
        });
      } else {
        console.log("   暂无交易记录");
      }
    } catch (e) {
      console.log("   无法获取交易记录:", e.message);
    }
    
    // 网络信息
    console.log("\n🌐 网络状态:");
    try {
      const version = await connection.getVersion();
      console.log(`   Solana版本: ${version['solana-core']}`);
      
      const epochInfo = await connection.getEpochInfo();
      console.log(`   当前Epoch: ${epochInfo.epoch}`);
      console.log(`   区块高度: ${epochInfo.absoluteSlot}`);
      
      const feeCalculator = await connection.getFeeCalculatorForBlockhash();
      console.log(`   当前交易费用: ${feeCalculator.value?.lamportsPerSignature || '未知'} lamports`);
    } catch (e) {
      console.log("   网络信息获取失败:", e.message);
    }
    
    console.log("\n🎯 建议:");
    if (balanceSOL < 0.01) {
      console.log("1. 建议转入至少 0.01 SOL ($0.80) 进行充分测试");
      console.log("2. 可以使用以下方式转入:");
      console.log("   - Phantom钱包: 发送到地址 " + publicKey.toString());
      console.log("   - 交易所提现");
      console.log("   - Solana水龙头 (测试网)");
    } else {
      console.log("1. 余额充足，可以开始测试交易");
      console.log("2. 建议先进行模拟交易验证策略");
      console.log("3. 小额测试确认系统正常工作");
    }
    
    console.log("\n⚠️ 安全提醒:");
    console.log("1. 此私钥已暴露，请勿存入大量资金");
    console.log("2. 测试完成后请创建新钱包");
    console.log("3. 建议使用硬件钱包存储大额资产");
    
    return {
      publicKey: publicKey.toString(),
      balanceSOL,
      balanceLamports,
      hasEnoughForTest: balanceSOL >= testAmount,
      rpcEndpoint
    };
    
  } catch (error) {
    console.error("❌ 余额检查失败:", error.message);
    console.error("错误详情:", error);
    return null;
  }
}

// 运行检查
checkWalletBalance().then(result => {
  if (result) {
    console.log("\n" + "=".repeat(50));
    console.log("✅ 钱包检查完成");
    console.log(`地址: ${result.publicKey}`);
    console.log(`余额: ${result.balanceSOL.toFixed(6)} SOL`);
    console.log(`测试状态: ${result.hasEnoughForTest ? '可测试' : '需要充值'}`);
  }
}).catch(error => {
  console.error("脚本执行失败:", error);
});