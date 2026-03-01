/**
 * Jupiter Client Wrapper
 * 
 * 根据配置选择使用真实Jupiter客户端或模拟客户端
 * 当没有API密钥或网络不可用时，自动回退到模拟模式
 */

const fs = require('fs');
const path = require('path');

class JupiterClientWrapper {
    constructor(config = {}) {
        this.config = {
            baseUrl: config.baseUrl || 'https://api.jup.ag/v6',
            timeout: config.timeout || 15000,
            apiKey: config.apiKey || process.env.JUPITER_API_KEY,
            useMock: config.useMock !== undefined ? config.useMock : false,
            autoFallback: config.autoFallback !== undefined ? config.autoFallback : true
        };
        
        this.client = null;
        this.isMock = false;
        
        this._initializeClient();
    }
    
    /**
     * 初始化客户端
     */
    _initializeClient() {
        // 如果明确指定使用模拟模式
        if (this.config.useMock) {
            console.log('🔧 使用模拟 Jupiter 客户端 (配置指定)');
            this._initMockClient();
            return;
        }
        
        // 检查是否有API密钥
        if (!this.config.apiKey) {
            console.log('⚠️  未找到 Jupiter API 密钥');
            
            if (this.config.autoFallback) {
                console.log('🔧 自动回退到模拟模式');
                this._initMockClient();
            } else {
                throw new Error('Jupiter API密钥未配置，且未启用自动回退');
            }
            return;
        }
        
        // 尝试初始化真实客户端
        try {
            console.log('🔧 尝试初始化真实 Jupiter 客户端');
            const JupiterClient = require('./jupiter-client');
            this.client = new JupiterClient(this.config);
            this.isMock = false;
            console.log('✅ 真实 Jupiter 客户端初始化成功');
            
            // 测试连接
            this._testConnection()
                .then(success => {
                    if (!success && this.config.autoFallback) {
                        console.log('⚠️  真实客户端连接测试失败，回退到模拟模式');
                        this._initMockClient();
                    }
                })
                .catch(() => {
                    if (this.config.autoFallback) {
                        console.log('⚠️  真实客户端初始化异常，回退到模拟模式');
                        this._initMockClient();
                    }
                });
                
        } catch (error) {
            console.error('❌ 真实 Jupiter 客户端初始化失败:', error.message);
            
            if (this.config.autoFallback) {
                console.log('🔧 回退到模拟模式');
                this._initMockClient();
            } else {
                throw error;
            }
        }
    }
    
    /**
     * 初始化模拟客户端
     */
    _initMockClient() {
        try {
            const MockJupiterClient = require('./mock-jupiter-client');
            this.client = new MockJupiterClient(this.config);
            this.isMock = true;
            console.log('✅ 模拟 Jupiter 客户端初始化成功');
        } catch (error) {
            console.error('❌ 模拟 Jupiter 客户端初始化失败:', error.message);
            throw error;
        }
    }
    
    /**
     * 测试连接
     */
    async _testConnection() {
        if (this.isMock) {
            return true; // 模拟客户端总是连接成功
        }
        
        try {
            // 尝试一个简单的API调用
            await this.client.getTokenList();
            console.log('✅ Jupiter API 连接测试成功');
            return true;
        } catch (error) {
            console.error('❌ Jupiter API 连接测试失败:', error.message);
            return false;
        }
    }
    
    /**
     * 获取客户端模式信息
     */
    getClientInfo() {
        return {
            isMock: this.isMock,
            baseUrl: this.config.baseUrl,
            hasApiKey: !!this.config.apiKey,
            mode: this.isMock ? '模拟模式' : '真实模式'
        };
    }
    
    /**
     * 代理所有方法调用到实际客户端
     */
    async getTokenList() {
        return this.client.getTokenList();
    }
    
    async getQuote(inputMint, outputMint, amount, slippageBps) {
        return this.client.getQuote(inputMint, outputMint, amount, slippageBps);
    }
    
    async analyzePriceImpact(quote) {
        return this.client.analyzePriceImpact(quote);
    }
    
    async simulateTransaction(swapTransaction) {
        return this.client.simulateTransaction(swapTransaction);
    }
    
    async getSwapInstruction(quote, takerAddress) {
        return this.client.getSwapInstruction(quote, takerAddress);
    }
    
    // 代理属性访问
    get tokens() {
        return this.client.tokens;
    }
    
    get connection() {
        return this.client.connection;
    }
    
    // 添加其他可能需要的方法
    async getPrice(mintAddress) {
        if (this.client.getPrice) {
            return this.client.getPrice(mintAddress);
        }
        throw new Error('getPrice 方法未实现');
    }
    
    async getTokenInfo(mintAddress) {
        if (this.client.getTokenInfo) {
            return this.client.getTokenInfo(mintAddress);
        }
        throw new Error('getTokenInfo 方法未实现');
    }
}

module.exports = JupiterClientWrapper;