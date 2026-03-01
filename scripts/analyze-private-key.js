const crypto = require('crypto');

// 用户提供的私钥
const privateKey = "5PYxTMwHwnXwFjZfz6j8a7Xz7ZoiccQ1VoM8j49aX66edqpmPQHDjXnacLZuXU2o5uPnxLjHYHJpJi4FkgEJjC6M";

console.log("🔍 Solana私钥格式分析");
console.log("=".repeat(50));

console.log("📊 基本信息:");
console.log("私钥长度:", privateKey.length, "字符");
console.log("私钥内容:", privateKey);

// 尝试不同的解码方式
console.log("\n🔧 尝试解码方式:");

// 1. 检查是否是Base58编码
try {
  const base58 = require('bs58');
  const decoded = base58.decode(privateKey);
  console.log("1. Base58解码成功");
  console.log("   解码后长度:", decoded.length, "字节");
  console.log("   解码内容（Hex）:", decoded.toString('hex'));
  
  if (decoded.length === 64) {
    console.log("   ✅ 可能是64字节的Solana私钥");
  } else if (decoded.length === 32) {
    console.log("   ✅ 可能是32字节的私钥种子");
  }
} catch (e) {
  console.log("1. Base58解码失败:", e.message);
}

// 2. 检查是否是Base64编码
try {
  const decoded = Buffer.from(privateKey, 'base64');
  console.log("2. Base64解码成功");
  console.log("   解码后长度:", decoded.length, "字节");
  console.log("   解码内容（Hex）:", decoded.toString('hex'));
  
  if (decoded.length === 64) {
    console.log("   ✅ 可能是64字节的Solana私钥");
  }
} catch (e) {
  console.log("2. Base64解码失败:", e.message);
}

// 3. 检查是否是助记词短语
const words = privateKey.split(' ');
if (words.length >= 12 && words.length <= 24) {
  console.log("3. 可能是助记词短语");
  console.log("   单词数量:", words.length);
  console.log("   第一个单词:", words[0]);
  console.log("   最后一个单词:", words[words.length - 1]);
} else {
  console.log("3. 不是助记词短语");
}

// 4. 检查是否是十六进制
if (/^[0-9a-fA-F]+$/.test(privateKey)) {
  console.log("4. 可能是十六进制字符串");
  console.log("   长度:", privateKey.length, "字符");
  console.log("   字节数:", privateKey.length / 2);
} else {
  console.log("4. 不是十六进制字符串");
}

console.log("\n💡 建议:");
console.log("1. 如果这是Base58编码的私钥，可能需要使用@solana/web3.js的Keypair.fromSecretKey()");
console.log("2. 如果这是助记词，需要使用@solana/web3.js的Keypair.fromSeed()");
console.log("3. 请确认私钥格式，或提供更多信息");

// 尝试使用bs58解码并创建Keypair
console.log("\n🔄 尝试创建Keypair:");
try {
  const { Keypair } = require('@solana/web3.js');
  const base58 = require('bs58');
  
  // 尝试直接使用bs58解码
  const decoded = base58.decode(privateKey);
  console.log("Base58解码长度:", decoded.length);
  
  if (decoded.length === 64) {
    const keypair = Keypair.fromSecretKey(decoded);
    console.log("✅ Keypair创建成功!");
    console.log("公钥地址:", keypair.publicKey.toString());
  } else if (decoded.length === 32) {
    // 如果是32字节的种子
    const keypair = Keypair.fromSeed(decoded);
    console.log("✅ 从种子创建Keypair成功!");
    console.log("公钥地址:", keypair.publicKey.toString());
  }
} catch (e) {
  console.log("❌ Keypair创建失败:", e.message);
}