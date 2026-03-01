/**
 * 钱包集成模块
 * 将钱包系统集成到NeedleBot AI交易系统
 */

const fs = require('fs').promises;
const path = require('path');
const { Connection, Keypair, PublicKey, VersionedTransaction } = require('@solana/web3.js');
const bs58 = require('bs58');
const axios = require('axios');
const logger = require('../utils/logger');

class WalletIntegration {
    constructor(configPath = './config/wallet-config.json') {
        this.configPath = path.resolve(configPath);
        this.config = null;
        this.walletManager = null;
        this.jupiterClient = null;
        this.solanaConnection = null;
        this.isInitialized = false;
        
        // 钱包状态
        this.walletState = {
            address: null,
            balanceSOL: 0,
            balanceUSD: 0,
            lastTransaction: null,
            transactionCount: 0,
            totalVolumeSOL: 0,
            isReady: false
        };
    }
    
    /**
     * 初始化钱包集成
     */
    async initialize() {
        try {
            logger.info('🚀 初始化钱包集成系统...');
            
            // 1. 加载配置
            await this.loadConfig();
            
            // 2. 初始化钱包管理器
            await this.initializeWalletManager();
            
            // 3. 初始化Jupiter客户端
            await this.initializeJupiterClient();
            
            // 4. 初始化Solana连接
            await this.initializeSolanaConnection();
            
            // 5. 检查钱包状态
            await this.checkWalletStatus();
            
            this.isInitialized = true;
            logger.info('✅ 钱包集成系统初始化完成');
            
            return true;
            
        } catch (error) {
            logger.error('❌ 钱包集成初始化失败:', error.message);
            return false;
        }
    }
    
    /**
     * 加载配置
     */
    async loadConfig() {
        try {
            const configData = await fs.readFile(this.configPath, 'utf8');
            this.config = JSON.parse(configData);
            logger.info(`✅ 钱包配置加载完成: ${this.configPath}`);
        } catch (error) {
            logger.error('加载钱包配置失败:', error.message);
            throw error;
        }
    }
    
    /**
     * 初始化钱包管理器
     */
    async initializeWalletManager() {
        try {
            // 导入现有的钱包管理器
            const { walletManager } = require('../security/wallet-manager');
            this.walletManager = walletManager;
            
            // 从环境变量加载钱包
            const loaded = await this.walletManager.loadFromEnv();
            
            if (!loaded) {
                logger.warn('未从环境变量加载到钱包，尝试手动导入...');
                
                // 尝试从配置导入
                const privateKey = process.env.SOLANA_PRIVATE_KEY;
                if (privateKey) {
                    await this.walletManager.importWallet(privateKey, 'primary');
                    logger.info('✅ 从环境变量手动导入钱包成功');
                } else {
                    throw new Error('未找到钱包私钥，请设置SOLANA_PRIVATE_KEY环境变量');
                }
            }
            
            // 获取钱包信息
            const wallet = this.walletManager.getWallet('primary');
            if (wallet) {
                this.walletState.address = wallet.publicKey;
                logger.info(`📱 钱包地址: ${wallet.publicKey}`);
            }
            
        } catch (error) {
            logger.error('初始化钱包管理器失败:', error.message);
            throw error;
        }
    }
    
    /**
     * 初始化Jupiter客户端
     */
    async initializeJupiterClient() {
        try {
            const jupiterConfig = this.config.integration.jupiterApi;
            
            this.jupiterClient = axios.create({
                baseURL: jupiterConfig.baseUrl,
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': jupiterConfig.apiKey,
                },
                timeout: 30000,
            });
            
            // 测试连接
            await this.testJupiterConnection();
            
            logger.info('✅ Jupiter客户端初始化完成');
            
        } catch (error) {
            logger.error('初始化Jupiter客户端失败:', error.message);
            throw error;
        }
    }
    
    /**
     * 测试Jupiter连接
     */
    async testJupiterConnection() {
        try {
            // 简单的API调用测试
            const response = await this.jupiterClient.get('/swap/v1/quote', {
                params: {
                    inputMint: 'So11111111111111111111111111111111111111112', // SOL
                    outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
                    amount: '1000000', // 0.001 SOL
                    slippageBps: '100',
                }
            });
            
            if (response.data && response.data.inAmount) {
                logger.info(`✅ Jupiter API连接测试成功`);
                return true;
            } else {
                throw new Error('Jupiter API返回数据格式错误');
            }
            
        } catch (error) {
            logger.error('Jupiter连接测试失败:', error.message);
            throw error;
        }
    }
    
    /**
     * 初始化Solana连接
     */
    async initializeSolanaConnection() {
        try {
            const rpcConfig = this.config.integration.solanaRpc;
            
            this.solanaConnection = new Connection(rpcConfig.primary, 'confirmed');
            
            // 测试连接
            await this.testSolanaConnection();
            
            logger.info(`✅ Solana RPC连接初始化完成: ${rpcConfig.primary}`);
            
        } catch (error) {
            logger.error('初始化Solana连接失败:', error.message);
            
            // 尝试备用RPC
            try {
                const rpcConfig = this.config.integration.solanaRpc;
                logger.warn(`尝试备用RPC: ${rpcConfig.fallback}`);
                
                this.solanaConnection = new Connection(rpcConfig.fallback, 'confirmed');
                await this.testSolanaConnection();
                
                logger.info(`✅ Solana备用RPC连接成功: ${rpcConfig.fallback}`);
            } catch (fallbackError) {
                logger.error('所有Solana RPC连接失败:', fallbackError.message);
                throw error;
            }
        }
    }
    
    /**
     * 测试Solana连接
     */
    async testSolanaConnection() {
        try {
            const version = await this.solanaConnection.getVersion();
            logger.info(`🔗 Solana节点版本: ${version['solana-core']}`);
            return true;
        } catch (error) {
            throw new Error(`Solana RPC连接失败: ${error.message}`);
        }
    }
    
    /**
     * 检查钱包状态
     */
    async checkWalletStatus() {
        try {
            if (!this.walletState.address) {
                throw new Error('钱包地址未设置');
            }
            
            const publicKey = new PublicKey(this.walletState.address);
            
            // 获取余额
            const balance = await this.solanaConnection.getBalance(publicKey);
            this.walletState.balanceSOL = balance / 1_000_000_000;
            
            // 获取交易历史（最近5笔）
            const signatures = await this.solanaConnection.getSignaturesForAddress(
                publicKey,
                { limit: 5 }
            );
            
            if (signatures.length > 0) {
                this.walletState.lastTransaction = signatures[0];
                this.walletState.transactionCount = signatures.length;
                
                // 估算总交易量（简化）
                this.walletState.totalVolumeSOL = signatures.length * 0.01; // 估算值
            }
            
            // 估算USD价值（使用当前汇率）
            const usdRate = await this.getSOLUSDPrice();
            this.walletState.balanceUSD = this.walletState.balanceSOL * usdRate;
            
            this.walletState.isReady = this.walletState.balanceSOL > 0;
            
            logger.info(`💰 钱包状态检查完成:`);
            logger.info(`   📊 余额: ${this.walletState.balanceSOL.toFixed(6)} SOL ($${this.walletState.balanceUSD.toFixed(2)})`);
            logger.info(`   📝 交易数量: ${this.walletState.transactionCount}`);
            logger.info(`   📈 总交易量: ${this.walletState.totalVolumeSOL.toFixed(2)} SOL`);
            logger.info(`   ✅ 就绪状态: ${this.walletState.isReady ? '是' : '否'}`);
            
            return this.walletState;
            
        } catch (error) {
            logger.error('检查钱包状态失败:', error.message);
            this.walletState.isReady = false;
            return this.walletState;
        }
    }
    
    /**
     * 获取SOL/USD价格
     */
    async getSOLUSDPrice() {
        try {
            // 使用Jupiter API获取SOL价格
            const response = await this.jupiterClient.get('/price/v3', {
                params: {
                    ids: 'So11111111111111111111111111111111111111112', // SOL
                }
            });
            
            if (response.data && response.data.data) {
                const solData = response.data.data['So11111111111111111111111111111111111111112'];
                return solData.price || 0.087; // 默认值
            }
            
            return 0.087; // 默认汇率
            
        } catch (error) {
            logger.warn('获取SOL价格失败，使用默认值:', error.message);
            return 0.087; // 默认汇率
        }
    }
    
    /**
     * 获取交易报价
     */
    async getQuote(inputMint, outputMint, amountSOL, slippageBps = 100) {
        try {
            const amountLamports = Math.floor(amountSOL * 1_000_000_000);
            
            const response = await this.jupiterClient.get('/swap/v1/quote', {
                params: {
                    inputMint: inputMint,
                    outputMint: outputMint,
                    amount: amountLamports.toString(),
                    slippageBps: slippageBps.toString(),
                    onlyDirectRoutes: false,
                    asLegacyTransaction: false,
                }
            });
            
            if (response.data) {
                logger.info(`✅ 获取报价成功: ${amountSOL} SOL`);
                
                // 计算USD价值
                const usdRate = await this.getSOLUSDPrice();
                const quoteValueUSD = amountSOL * usdRate;
                
                return {
                    success: true,
                    quote: response.data,
                    amountSOL: amountSOL,
                    amountUSD: quoteValueUSD,
                    timestamp: new Date().toISOString()
                };
            } else {
                throw new Error('报价数据为空');
            }
            
        } catch (error) {
            logger.error('获取报价失败:', error.message);
            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
    
    /**
     * 执行交易
     */
    async executeTrade(quoteResponse, confirm = false) {
        try {
            // 检查测试模式
            if (this.config.testing.testMode && !confirm) {
                logger.info('🔬 测试模式：跳过实际交易执行');
                return {
                    success: true,
                    testMode: true,
                    simulated: true,
                    message: '测试模式，交易已模拟',
                    timestamp: new Date().toISOString()
                };
            }
            
            // 检查余额
            const requiredSOL = parseInt(quoteResponse.inAmount) / 1_000_000_000;
            if (this.walletState.balanceSOL < requiredSOL) {
                throw new Error(`余额不足: 需要 ${requiredSOL} SOL，当前 ${this.walletState.balanceSOL} SOL`);
            }
            
            // 获取交易指令
            const swapResponse = await this.jupiterClient.post('/swap/v1/swap', {
                quoteResponse: quoteResponse,
                userPublicKey: this.walletState.address,
                wrapAndUnwrapSol: true,
                dynamicComputeUnitLimit: true,
            });
            
            if (!swapResponse.data || !swapResponse.data.swapTransaction) {
                throw new Error('交易指令生成失败');
            }
            
            // 解码交易
            const swapTransactionBuf = Buffer.from(swapResponse.data.swapTransaction, 'base64');
            const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
            
            // 获取私钥并签名
            const privateKey = this.walletManager.getPrivateKey('primary');
            const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
            
            // 签名交易
            transaction.sign([keypair]);
            
            // 发送交易
            const signature = await this.solanaConnection.sendTransaction(transaction);
            
            logger.info(`✅ 交易已发送，签名: ${signature}`);
            
            // 等待确认
            if (this.config.transactionSettings.requireConfirmation) {
                const confirmation = await this.solanaConnection.confirmTransaction({
                    signature: signature,
                    ...(this.config.transactionSettings.confirmationTimeoutSeconds && {
                        commitment: 'confirmed',
                        timeout: this.config.transactionSettings.confirmationTimeoutSeconds * 1000
                    })
                });
                
                if (confirmation.value.err) {
                    throw new Error(`交易确认失败: ${JSON.stringify(confirmation.value.err)}`);
                }
                
                logger.info(`✅ 交易已确认: ${signature}`);
            }
            
            // 更新钱包状态
            await this.checkWalletStatus();
            
            return {
                success: true,
                signature: signature,
                amountSOL: requiredSOL,
                timestamp: new Date().toISOString(),
                confirmed: this.config.transactionSettings.requireConfirmation
            };
            
        } catch (error) {
            logger.error('执行交易失败:', error.message);
            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
    
    /**
     * 集成到NeedleBot系统
     */
    async integrateWithNeedleBot() {
        try {
            logger.info('🔗 将钱包集成到NeedleBot系统...');
            
            // 检查NeedleBot系统是否运行
            const needlebotRunning = await this.checkNeedleBotStatus();
            
            if (!needlebotRunning) {
                logger.warn('NeedleBot系统未运行，无法集成');
                return false;
            }
            
            // 创建集成配置文件
            const integrationConfig = {
                wallet: {
                    address: this.walletState.address,
                    balanceSOL: this.walletState.balanceSOL,
                    isReady: this.walletState.isReady,
                    integrationTime: new Date().toISOString()
                },
                trading: {
                    enabled: this.config.integration.needlebotSystem.tradeExecution,
                    maxAmountSOL: this.config.transactionSettings.maxTransactionAmountSOL,
                    defaultSlippageBps: this.config.transactionSettings.defaultSlippageBps
                },
                monitoring: {
                    enabled: this.config.integration.needlebotSystem.monitoringIntegration,
                    checkIntervalMinutes: this.config.monitoring.balanceCheckIntervalMinutes
                }
            };
            
            // 保存集成配置
            const integrationPath = path.join(__dirname, '../../config/wallet-integration.json');
            await fs.writeFile(integrationPath, JSON.stringify(integrationConfig, null, 2));
            
            logger.info(`✅ 钱包集成配置已保存: ${integrationPath}`);
            
            // 通知NeedleBot系统（通过API或文件系统）
            await this.notifyNeedleBotSystem(integrationConfig);
            
            logger.info('✅ 钱包已成功集成到NeedleBot系统');
            return true;
            
        } catch (error) {
            logger.error('集成到NeedleBot系统失败:', error.message);
            return false;
        }
    }
    
    /**
     * 检查NeedleBot系统状态
     */
    async checkNeedleBotStatus() {
        try {
            // 检查NeedleBot进程是否运行
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);
            
            const { stdout } = await execAsync('pgrep -f "node.*needlebot" || echo "not running"');
            
            if (stdout.trim() === 'not running') {
                return false;
            }
            
            return true;
            
        } catch (error) {
            logger.warn('检查NeedleBot状态失败:', error.message);
            return false;
        }
    }
    
    /**
     * 通知NeedleBot系统
     */
    async notifyNeedleBotSystem(config) {
        try {
            // 方法1: 通过API通知
            // 方法2: 通过文件系统信号
            // 这里使用文件系统方法
            
            const signalPath = path.join(__dirname, '../../.wallet-integration-signal');
            await fs.writeFile(signalPath, JSON.stringify({
                action: 'wallet_integrated',
                config: config,
                timestamp: new Date().toISOString()
            }));
            
            logger.info(`📢 已发送钱包集成信号到NeedleBot系统`);
            
        } catch (error) {
            logger.warn('通知NeedleBot系统失败:', error.message);
        }
    }
    
    /**
     * 获取钱包状态报告
     */
    getStatusReport() {
        return {
            initialized: this.isInitialized,
            wallet: this.walletState,
            config: {
                testing: this.config.testing.testMode,
                paperTrading: this.config.testing.paperTrading,
                requireApproval: this.config.testing.requireManualApproval
            },
            integrations: {
                jupiter: !!this.jupiterClient,
                solana: !!this.solanaConnection,
                needlebot: this.config.integration.needlebotSystem.enabled
            },
            timestamp: new Date().toISOString()
        };
    }
    
    /**
     * 安全关闭
     */
    async shutdown() {
        try {
            logger.info('🔒 安全关闭钱包集成系统...');
            
            // 清理敏感数据
            if (this.walletManager && this.walletManager.clearSensitiveData) {
                this.walletManager.clearSensitiveData();
            }
            
            // 重置状态
            this.isInitialized = false;
            this.walletState.isReady = false;
            
            logger.info('✅ 钱包集成系统已安全关闭');
            
        } catch (error) {
            logger.error('关闭钱包集成系统失败:', error.message);
        }
    }
}

// 创建单例实例
const walletIntegration = new WalletIntegration();

// 导出模块
module.exports = {
    WalletIntegration,
    walletIntegration,
    
    // 便捷函数
    initialize: () => walletIntegration.initialize(),
    getStatus: () => walletIntegration.getStatusReport(),
    getQuote: (inputMint, outputMint, amountSOL, slippageBps) => 
        walletIntegration.getQuote(inputMint, outputMint, amountSOL, slippageBps),
    executeTrade: (quoteResponse, confirm) => 
        walletIntegration.executeTrade(quoteResponse, confirm),
    integrateWithNeedleBot: () => walletIntegration.integrateWithNeedleBot(),
    shutdown: () => walletIntegration.shutdown()
};
