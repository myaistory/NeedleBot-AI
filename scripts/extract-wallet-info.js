const { Keypair } = require('@solana/web3.js');

// 用户提供的私钥
const privateKey = "5PYxTMwHwnXwFjZfz6j8a7Xz7ZoiccQ1VoM8j49aX66edqpmPQHDjXnacLZuXU2o5uPnxLjHYHJpJi4FkgEJjC6M";

console.log("🔐 Solana钱包信息提取");
console.log("=".repeat(50));

try {
  // 从私钥字符串创建Keypair
  const keypair = Keypair.fromSecretKey(
    Uint8Array.from(Buffer.from(privateKey, 'base64'))
  );
  
  console.log("✅ 私钥格式验证成功");
  console.log("📱 公钥地址:", keypair.publicKey.toString());
  console.log("🔑 私钥长度:", privateKey.length, "字符");
  console.log("📊 私钥类型: Base64编码");
  
  // 验证私钥正确性
  const secretKey = keypair.secretKey;
  console.log("🔒 私钥字节长度:", secretKey.length);
  
  // 生成环境变量配置
  console.log("\n📋 环境变量配置示例:");
  console.log("SOLANA_PRIVATE_KEY=" + privateKey);
  console.log("SOLANA_PUBLIC_KEY=" + keypair.publicKey.toString());
  
  // 生成配置文件内容
  console.log("\n📁 配置文件内容 (.env):");
  console.log(`
# Solana钱包配置
SOLANA_PRIVATE_KEY=${privateKey}
SOLANA_PUBLIC_KEY=${keypair.publicKey.toString()}
SOLANA_NETWORK=mainnet-beta
SOLANA_RPC_ENDPOINT=https://purple-wiser-tab.solana-mainnet.quiknode.pro
JUPITER_API_KEY=ddc333e0-5736-43c0-b0fb-5ba6c8823e5e
  `.trim());
  
  console.log("\n⚠️ 安全提醒:");
  console.log("1. 此私钥已暴露在聊天记录中");
  console.log("2. 建议仅用于测试，不要存入大量资金");
  console.log("3. 测试完成后请创建新钱包");
  
} catch (error) {
  console.error("❌ 私钥解析错误:", error.message);
  console.log("请检查私钥格式是否正确（应为Base64编码）");
}