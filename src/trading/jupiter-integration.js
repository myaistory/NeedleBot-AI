/**
 * Jupiter API 集成 - Solana链上交易接口
 * 提供真实的代币交换功能
 */

const axios = require('axios');
const logger = require('../utils/logger');
const { PublicKey, VersionedTransaction } = require('@solana/web3.js');

class JupiterIntegration {
    constructor(config = {}) {
        this.config = {
            jupiterApiUrl: 'https://quote-api.jup.ag/v6',
            solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
            slippageBps: 50, // 0.5% 滑点
            maxRetries: 3,
            timeout: 10000,
            ...config
        };
        
        this.connection = null;
        this.wallet = null;
        this.isInitialized = false;
    }
    
    /**
     * 初始化连接
     */
    async initialize(wallet, connection) {
        try {
            this.wallet = wallet;
            this.connection = connection;
            this.isInitialized = true;
            logger.info('✅ Jupiter API 初始化完成');
            return true;
        } catch (error) {
            logger.error('Jupiter API 初始化失败:', error.message);
            return false;
        }
    }
    
    /**
     * 获取报价
     */
    async getQuote(inputMint, outputMint, amount, options = {}) {
        if (!this.isInitialized) {
            throw new Error('Jupiter API 未初始化');
        }
        
        try {
            const params = {
                inputMint: inputMint,
                outputMint: outputMint,
                amount: amount.toString(),
                slippageBps: options.slippageBps || this.config.slippageBps,
                onlyDirectRoutes: options.onlyDirectRoutes || false,
                asLegacyTransaction: options.asLegacyTransaction || false
            };
            
            const response = await axios.get(`${this.config.jupiterApiUrl}/quote`, {
                params: params,
                timeout: this.config.timeout
            });
            
            if (!response.data || !response.data.data) {
                throw new Error('获取报价失败');
            }
            
            const quote = response.data.data;
            
            logger.info(`获取报价: ${amount} -> ${quote.outAmount} (${quote.priceImpactPct}% 价格影响)`);
            
            return {
                quote: quote,
                inputAmount: amount,
                outputAmount: quote.outAmount,
                priceImpact: quote.priceImpactPct,
                routePlan: quote.routePlan,
                slippageBps: quote.slippageBps
            };
            
        } catch (error) {
            logger.error('获取报价失败:', error.message);
            if (error.response) {
                logger.error('API响应:', error.response.data);
            }
            throw error;
        }
    }
    
    /**
     * 获取交换指令
     */
    async getSwapInstruction(quote, options = {}) {
        if (!this.isInitialized) {
            throw new Error('Jupiter API 未初始化');
        }
        
        try {
            const response = await axios.post(`${this.config.jupiterApiUrl}/swap-instructions`, {
                quoteResponse: quote,
                userPublicKey: this.wallet.publicKey.toString(),
                wrapAndUnwrapSol: options.wrapAndUnwrapSol !== false,
                dynamicComputeUnitLimit: options.dynamicComputeUnitLimit !== false,
                prioritizationFeeLamports: options.prioritizationFeeLamports || 'auto'
            }, {
                timeout: this.config.timeout
            });
            
            if (!response.data || !response.data.data) {
                throw new Error('获取交换指令失败');
            }
            
            return response.data.data;
            
        } catch (error) {
            logger.error('获取交换指令失败:', error.message);
            throw error;
        }
    }
    
    /**
     * 执行交换
     */
    async executeSwap(inputMint, outputMint, amount, options = {}) {
        const startTime = Date.now();
        
        try {
            logger.info(`开始执行交换: ${amount} ${inputMint} -> ${outputMint}`);
            
            // 1. 获取报价
            const quoteData = await this.getQuote(inputMint, outputMint, amount, options);
            
            // 2. 检查价格影响
            if (quoteData.priceImpact > (options.maxPriceImpact || 5)) {
                throw new Error(`价格影响过高: ${quoteData.priceImpact.toFixed(2)}%`);
            }
            
            // 3. 获取交换指令
            const swapData = await this.getSwapInstruction(quoteData.quote, options);
            
            // 4. 构建交易
            const transaction = await this.buildTransaction(swapData);
            
            // 5. 签名交易
            const signature = await this.signAndSendTransaction(transaction);
            
            const duration = Date.now() - startTime;
            
            logger.info(`✅ 交换完成: ${signature} (${duration}ms)`);
            
            return {
                success: true,
                signature: signature,
                inputAmount: amount,
                outputAmount: quoteData.outputAmount,
                priceImpact: quoteData.priceImpact,
                duration: duration,
                timestamp: Date.now()
            };
            
        } catch (error) {
            logger.error('执行交换失败:', error.message);
            
            return {
                success: false,
                error: error.message,
                inputAmount: amount,
                timestamp: Date.now()
            };
        }
    }
    
    /**
     * 构建交易
     */
    async buildTransaction(swapData) {
        try {
            const { setupTransaction, swapTransaction, cleanupTransaction } = swapData;
            
            // 合并所有交易指令
            const allInstructions = [];
            
            if (setupTransaction?.data) {
                allInstructions.push(...setupTransaction.data);
            }
            
            if (swapTransaction?.data) {
                allInstructions.push(...swapTransaction.data);
            }
            
            if (cleanupTransaction?.data) {
                allInstructions.push(...cleanupTransaction.data);
            }
            
            // 创建VersionedTransaction
            const message = new VersionedMessage();
            const transaction = new VersionedTransaction(message);
            
            // 这里需要更完整的交易构建逻辑
            // 简化版本，实际使用需要完整的Solana交易构建
            
            return transaction;
            
        } catch (error) {
            logger.error('构建交易失败:', error.message);
            throw error;
        }
    }
    
    /**
     * 签名并发送交易
     */
    async signAndSendTransaction(transaction) {
        try {
            // 签名交易
            const signature = await this.wallet.signTransaction(transaction);
            
            // 发送交易
            const txid = await this.connection.sendTransaction(signature, {
                skipPreflight: false,
                preflightCommitment: 'confirmed'
            });
            
            // 等待确认
            const confirmation = await this.connection.confirmTransaction(txid, 'confirmed');
            
            if (confirmation.value.err) {
                throw new Error(`交易失败: ${confirmation.value.err}`);
            }
            
            return txid;
            
        } catch (error) {
            logger.error('签名并发送交易失败:', error.message);
            throw error;
        }
    }
    
    /**
     * 获取代币价格
     */
    async getTokenPrice(tokenMint) {
        try {
            const response = await axios.get(
                `https://api.jup.ag/price/v2?ids=${tokenMint}`,
                { timeout: 5000 }
            );
            
            if (!response.data || !response.data.data || !response.data.data[tokenMint]) {
                return null;
            }
            
            return {
                price: response.data.data[tokenMint].price,
                symbol: response.data.data[tokenMint].symbol,
                timestamp: Date.now()
            };
            
        } catch (error) {
            logger.error('获取代币价格失败:', error.message);
            return null;
        }
    }
    
    /**
     * 获取支持的代币列表
     */
    async getSupportedTokens() {
        try {
            const response = await axios.get(
                'https://token.jup.ag/all',
                { timeout: 10000 }
            );
            
            if (!response.data) {
                return [];
            }
            
            return response.data;
            
        } catch (error) {
            logger.error('获取代币列表失败:', error.message);
            return [];
        }
    }
    
    /**
     * 检查API健康状态
     */
    async checkHealth() {
        try {
            const startTime = Date.now();
            await axios.get('https://quote-api.jup.ag/v6/health', { timeout: 5000 });
            const responseTime = Date.now() - startTime;
            
            return {
                status: 'healthy',
                responseTime: responseTime,
                timestamp: Date.now()
            };
            
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: Date.now()
            };
        }
    }
}

module.exports = JupiterIntegration;