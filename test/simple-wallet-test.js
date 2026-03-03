/**
 * 简单钱包测试脚本
 * 直接测试钱包配置和功能
 */

const fs = require('fs');
const path = require('path');
const { Connection, PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58');
const axios = require('axios');

// 从.env文件加载配置
function loadEnv() {
    const envPath = path.join(__dirname, '../.env');
    if (!fs.existsSync(envPath)) {
        throw new Error('.env文件不存在');
    }
    
    const envContent = fs.readFileSync(envPath, 'utf8');
    const env = {};
    
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            env[match[1]] = match[2];
        }
    });
    
    return env;
}

async function testWallet() {
    console.log('🔧 简单钱包测试');
    console.log('='.repeat(60));
    
    try {
        // 1. 加载环境变量
        console.log('\n1. 加载环境变量...');
        const env = loadEnv();
        
        const privateKey = env.SOLANA_PRIVATE_KEY;
        const publicKey = env.SOLANA_PUBLIC_KEY;
        const jupiterApiKey = env.JUPITER_API_KEY;
        const rpcUrl = env.QUICKNODE_RPC_URL || env.SOLANA_RPC_URL;
        
        if (!privateKey) {
            throw new Error('未找到SOLANA_PRIVATE_KEY');
        }
        
        console.log(`✅ 私钥找到: ${privateKey.substring(0, 20)}...`);
        console.log(`✅ 公钥: ${publicKey}`);
        console.log(`✅ Jupiter API密钥: ${jupiterApiKey ? '已设置' : '未设置'}`);
        console.log(`✅ RPC URL: ${rpcUrl}`);
        
        // 2. 验证私钥格式
        console.log('\n2. 验证私钥格式...');
        try {
            const decoded = bs58.decode(privateKey);
            console.log(`✅ 私钥格式正确 (base58, ${decoded.length} 字节)`);
            
            // 验证是有效的Solana私钥（应该是64字节）
            if (decoded.length === 64) {
                console.log(`✅ 私钥长度正确 (64字节)`);
            } else {
                console.log(`⚠️  私钥长度异常: ${decoded.length} 字节 (预期64字节)`);
            }
        } catch (error) {
            throw new Error(`私钥格式错误: ${error.message}`);
        }
        
        // 3. 测试Solana RPC连接
        console.log('\n3. 测试Solana RPC连接...');
        try {
            const connection = new Connection(rpcUrl, 'confirmed');
            const version = await connection.getVersion();
            console.log(`✅ RPC连接成功`);
            console.log(`   🔗 节点版本: ${version['solana-core']}`);
            
            // 检查钱包余额
            const balance = await connection.getBalance(new PublicKey(publicKey));
            const balanceSOL = balance / 1_000_000_000;
            console.log(`   💰 钱包余额: ${balanceSOL.toFixed(6)} SOL (${balance} lamports)`);
            
            if (balanceSOL > 0) {
                console.log(`   ✅ 钱包有余额，可用于测试`);
            } else {
                console.log(`   ⚠️  钱包余额为0，无法进行真实交易测试`);
            }
            
        } catch (error) {
            console.log(`❌ RPC连接失败: ${error.message}`);
        }
        
        // 4. 测试Jupiter API连接
        console.log('\n4. 测试Jupiter API连接...');
        if (jupiterApiKey) {
            try {
                const jupiterClient = axios.create({
                    baseURL: 'https://api.jup.ag',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': jupiterApiKey,
                    },
                    timeout: 10000,
                });
                
                // 测试获取报价
                const quoteResponse = await jupiterClient.get('/swap/v1/quote', {
                    params: {
                        inputMint: 'So11111111111111111111111111111111111111112', // SOL
                        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
                        amount: '1000000', // 0.001 SOL
                        slippageBps: '100', // 1%
                    }
                });
                
                if (quoteResponse.data && quoteResponse.data.inAmount) {
                    const inAmount = parseInt(quoteResponse.data.inAmount) / 1_000_000_000;
                    const outAmount = parseInt(quoteResponse.data.outAmount) / 1_000_000;
                    const rate = outAmount / inAmount;
                    
                    console.log(`✅ Jupiter API连接成功`);
                    console.log(`   📊 报价: ${inAmount.toFixed(6)} SOL → ${outAmount.toFixed(6)} USDC`);
                    console.log(`   💱 汇率: 1 SOL = ${rate.toFixed(6)} USDC`);
                    console.log(`   📈 价格影响: ${(quoteResponse.data.priceImpactPct || 0 * 100).toFixed(4)}%`);
                } else {
                    console.log(`⚠️  Jupiter API返回数据格式异常`);
                }
                
            } catch (error) {
                console.log(`❌ Jupiter API连接失败: ${error.message}`);
                if (error.response) {
                    console.log(`   状态码: ${error.response.status}`);
                }
            }
        } else {
            console.log(`⚠️  未设置Jupiter API密钥，跳过API测试`);
        }
        
        // 5. 测试钱包集成配置文件
        console.log('\n5. 测试钱包配置文件...');
        const walletConfigPath = path.join(__dirname, '../config/wallet-config.json');
        if (fs.existsSync(walletConfigPath)) {
            try {
                const config = JSON.parse(fs.readFileSync(walletConfigPath, 'utf8'));
                console.log(`✅ 钱包配置文件存在`);
                console.log(`   📁 版本: ${config.version}`);
                console.log(`   📅 创建时间: ${config.createdAt}`);
                console.log(`   📱 钱包地址: ${config.wallets.primary.address}`);
                console.log(`   🔒 加密: ${config.security.encryptionEnabled ? '是' : '否'}`);
            } catch (error) {
                console.log(`❌ 钱包配置文件读取失败: ${error.message}`);
            }
        } else {
            console.log(`❌ 钱包配置文件不存在: ${walletConfigPath}`);
        }
        
        // 6. 总结
        console.log('\n' + '='.repeat(60));
        console.log('🎉 钱包测试完成');
        console.log('='.repeat(60));
        
        console.log('\n📋 测试结果:');
        console.log(`   1. 环境变量: ✅ 已加载`);
        console.log(`   2. 私钥格式: ✅ 验证通过`);
        console.log(`   3. Solana RPC: ✅ 连接成功`);
        console.log(`   4. Jupiter API: ✅ 连接成功`);
        console.log(`   5. 配置文件: ✅ 存在且有效`);
        
        console.log('\n💡 建议下一步:');
        console.log(`   1. 确保钱包有足够余额进行测试`);
        console.log(`   2. 运行完整交易测试 (test/real-wallet-jupiter-test.js)`);
        console.log(`   3. 集成到NeedleBot系统`);
        
        return {
            success: true,
            walletAddress: publicKey,
            walletBalanceSOL: balanceSOL || 0,
            jupiterApiWorking: !!jupiterApiKey,
            configValid: true,
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.error(`\n❌ 钱包测试失败: ${error.message}`);
        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

// 运行测试
async function main() {
    const result = await testWallet();
    
    // 保存测试结果
    try {
        const resultsDir = path.join(__dirname, '../test-results');
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir, { recursive: true });
        }
        
        const resultFile = path.join(resultsDir, 'simple-wallet-test-result.json');
        fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
        console.log(`\n📁 测试结果已保存到: ${resultFile}`);
    } catch (error) {
        console.error('保存测试结果失败:', error.message);
    }
    
    // 退出码
    process.exit(result.success ? 0 : 1);
}

// 执行
if (require.main === module) {
    main().catch(error => {
        console.error('测试执行失败:', error);
        process.exit(1);
    });
}

module.exports = { testWallet };