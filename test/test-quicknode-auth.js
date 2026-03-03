const { Connection, PublicKey } = require('@solana/web3.js');

async function testQuickNodeConnection() {
  console.log("🔗 测试QuickNode RPC连接");
  console.log("=".repeat(50));
  
  const endpoints = [
    {
      name: "QuickNode Premium",
      url: "https://purple-wiser-tab.solana-mainnet.quiknode.pro",
      needsAuth: true
    },
    {
      name: "Public RPC",
      url: "https://api.mainnet-beta.solana.com",
      needsAuth: false
    },
    {
      name: "Helius (备用)",
      url: "https://mainnet.helius-rpc.com",
      needsAuth: false
    }
  ];
  
  const testWallet = new PublicKey("2LhAWAWRzt5cGv7qWq1md4S2mvoxTmKSVxTEEuuq9ei5");
  
  for (const endpoint of endpoints) {
    console.log(`\n测试: ${endpoint.name}`);
    console.log(`URL: ${endpoint.url}`);
    
    try {
      const connection = new Connection(endpoint.url, 'confirmed');
      
      // 测试1: 获取版本
      console.log("  1. 获取版本信息...");
      const version = await connection.getVersion();
      console.log(`     ✅ 成功: Solana ${version['solana-core']}`);
      
      // 测试2: 获取余额
      console.log("  2. 获取钱包余额...");
      const balance = await connection.getBalance(testWallet);
      console.log(`     ✅ 成功: ${balance / 1_000_000_000} SOL`);
      
      // 测试3: 获取最新区块哈希
      console.log("  3. 获取最新区块哈希...");
      const blockhash = await connection.getLatestBlockhash();
      console.log(`     ✅ 成功: ${blockhash.blockhash.slice(0, 16)}...`);
      
      console.log(`  🎯 连接状态: ✅ 完全正常`);
      
    } catch (error) {
      console.log(`  ❌ 连接失败: ${error.message}`);
      
      if (error.message.includes("401") || error.message.includes("UNAUTHORIZED")) {
        console.log(`  💡 需要API密钥认证`);
      } else if (error.message.includes("429")) {
        console.log(`  💡 请求频率限制`);
      }
    }
  }
  
  console.log("\n" + "=".repeat(50));
  console.log("💡 建议:");
  console.log("1. QuickNode需要认证，但交易功能可能正常");
  console.log("2. 可以使用公共RPC进行查询");
  console.log("3. 交易时可能需要使用QuickNode的完整URL（包含密钥）");
}

testQuickNodeConnection().catch(console.error);