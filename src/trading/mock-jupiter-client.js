/**
 * Mock Jupiter Client for testing
 * 
 * This provides simulated Jupiter API responses for testing without requiring
 * actual API keys or network calls.
 */

const axios = require('axios');

class MockJupiterClient {
    constructor(config = {}) {
        this.config = {
            baseUrl: config.baseUrl || 'https://api.jup.ag/v6',
            timeout: config.timeout || 15000,
            mockMode: true
        };
        
        this.tokens = {
            SOL: 'So11111111111111111111111111111111111111112',
            USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
            BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
            WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
            POPCAT: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',
            WEN: 'WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk'
        };
        
        console.log('🔧 MockJupiterClient 初始化完成 (模拟模式)');
    }
    
    /**
     * 获取代币列表 (模拟)
     */
    async getTokenList() {
        console.log('📋 模拟获取代币列表');
        
        // 返回模拟的代币数据
        const mockTokens = {};
        
        Object.entries(this.tokens).forEach(([symbol, address]) => {
            mockTokens[address] = {
                symbol,
                name: `${symbol} Token`,
                address,
                decimals: symbol === 'SOL' ? 9 : 6,
                logoURI: `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${address}/logo.png`,
                tags: ['verified'],
                verified: true,
                holderCount: Math.floor(Math.random() * 100000) + 1000,
                volume24h: Math.floor(Math.random() * 10000000) + 1000000
            };
        });
        
        // 添加一些额外的模拟代币
        const extraTokens = [
            { symbol: 'RAY', address: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', decimals: 6 },
            { symbol: 'SRM', address: 'SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt', decimals: 6 },
            { symbol: 'MSOL', address: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', decimals: 9 },
            { symbol: 'JUP', address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', decimals: 6 }
        ];
        
        extraTokens.forEach(token => {
            mockTokens[token.address] = {
                symbol: token.symbol,
                name: `${token.symbol} Token`,
                address: token.address,
                decimals: token.decimals,
                logoURI: `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${token.address}/logo.png`,
                tags: ['verified'],
                verified: true,
                holderCount: Math.floor(Math.random() * 50000) + 5000,
                volume24h: Math.floor(Math.random() * 5000000) + 500000
            };
        });
        
        console.log(`✅ 模拟返回 ${Object.keys(mockTokens).length} 个代币`);
        return mockTokens;
    }
    
    /**
     * 获取报价 (模拟)
     */
    async getQuote(inputMint, outputMint, amount, slippageBps = 50) {
        console.log(`💰 模拟报价: ${this._getTokenSymbol(inputMint)} → ${this._getTokenSymbol(outputMint)}`);
        
        // 模拟价格计算
        const inputSymbol = this._getTokenSymbol(inputMint);
        const outputSymbol = this._getTokenSymbol(outputMint);
        
        // 基础价格映射 (模拟)
        const priceMap = {
            'SOL': { 'USDC': 150, 'USDT': 150, 'BONK': 1000000, 'WIF': 500 },
            'USDC': { 'SOL': 0.00667, 'USDT': 1.0, 'BONK': 6666.67, 'WIF': 3.33 },
            'USDT': { 'SOL': 0.00667, 'USDC': 1.0, 'BONK': 6666.67, 'WIF': 3.33 },
            'BONK': { 'SOL': 0.000001, 'USDC': 0.00015, 'USDT': 0.00015, 'WIF': 0.0005 },
            'WIF': { 'SOL': 0.002, 'USDC': 0.3, 'USDT': 0.3, 'BONK': 2000 }
        };
        
        // 获取基础价格
        let basePrice = 1.0;
        if (priceMap[inputSymbol] && priceMap[inputSymbol][outputSymbol]) {
            basePrice = priceMap[inputSymbol][outputSymbol];
        } else if (priceMap[outputSymbol] && priceMap[outputSymbol][inputSymbol]) {
            basePrice = 1 / priceMap[outputSymbol][inputSymbol];
        }
        
        // 添加随机波动 (±2%)
        const randomFactor = 0.98 + Math.random() * 0.04;
        const finalPrice = basePrice * randomFactor;
        
        // 计算输出金额
        const inputAmount = Number(amount);
        let outputAmount;
        
        if (inputSymbol === 'SOL' && outputSymbol === 'USDC') {
            // SOL → USDC: SOL有9位小数，USDC有6位小数
            outputAmount = Math.floor(inputAmount * finalPrice / 1000); // 转换为USDC单位
        } else if (inputSymbol === 'USDC' && outputSymbol === 'SOL') {
            // USDC → SOL: USDC有6位小数，SOL有9位小数
            outputAmount = Math.floor(inputAmount * finalPrice * 1000); // 转换为SOL单位
        } else {
            // 其他代币对
            outputAmount = Math.floor(inputAmount * finalPrice);
        }
        
        // 确保最小输出
        outputAmount = Math.max(outputAmount, 1000);
        
        const mockQuote = {
            inputMint,
            outputMint,
            inAmount: amount.toString(),
            outAmount: outputAmount.toString(),
            otherAmountThreshold: outputAmount.toString(),
            slippageBps: slippageBps.toString(),
            platformFee: null,
            priceImpactPct: (Math.random() * 0.5).toFixed(4), // 0-0.5% 价格影响
            routePlan: [
                {
                    swapInfo: {
                        ammKey: '模拟路由',
                        label: '模拟DEX池',
                        inputMint,
                        outputMint,
                        inAmount: amount.toString(),
                        outAmount: outputAmount.toString(),
                        feeAmount: '1000',
                        feeMint: inputMint
                    },
                    percent: 100
                }
            ],
            contextSlot: Math.floor(Math.random() * 1000000),
            timeTaken: 0.05
        };
        
        console.log(`   输入: ${this._formatAmount(amount, inputMint)}`);
        console.log(`   输出: ${this._formatAmount(outputAmount, outputMint)}`);
        console.log(`   价格影响: ${mockQuote.priceImpactPct}%`);
        console.log(`   滑点: ${slippageBps / 100}%`);
        
        return mockQuote;
    }
    
    /**
     * 分析价格影响 (模拟)
     */
    async analyzePriceImpact(quote) {
        console.log('📊 模拟价格影响分析');
        
        const priceImpact = parseFloat(quote.priceImpactPct || '0.1');
        const priceImpactPercent = priceImpact;
        
        const analysis = {
            priceImpact: priceImpact / 100,
            priceImpactPercent: priceImpactPercent,
            severity: this._getPriceImpactSeverity(priceImpactPercent),
            recommendation: this._getPriceImpactRecommendation(priceImpactPercent),
            timestamp: new Date().toISOString(),
            simulated: true
        };
        
        console.log(`   价格影响: ${priceImpactPercent.toFixed(4)}% (${analysis.severity})`);
        console.log(`   建议: ${analysis.recommendation}`);
        
        return analysis;
    }
    
    /**
     * 模拟交易 (模拟)
     */
    async simulateTransaction(swapTransaction) {
        console.log('🔄 模拟交易执行');
        
        // 模拟成功概率
        const successRate = 0.95; // 95% 成功率
        const isSuccess = Math.random() < successRate;
        
        const result = {
            success: isSuccess,
            error: isSuccess ? null : '模拟交易失败: 超时',
            logs: isSuccess ? [
                'Program log: Instruction: Swap',
                'Program log: Transfer 1000000 lamports',
                'Program log: Success'
            ] : [
                'Program log: Instruction: Swap',
                'Program log: Error: Transaction timeout'
            ],
            unitsConsumed: isSuccess ? Math.floor(Math.random() * 200000) + 100000 : 0,
            computeUnits: isSuccess ? Math.floor(Math.random() * 200000) + 100000 : 0,
            simulated: true
        };
        
        if (result.success) {
            console.log('✅ 模拟交易成功');
            console.log(`   消耗计算单元: ${result.unitsConsumed}`);
        } else {
            console.log('❌ 模拟交易失败');
            console.log(`   错误: ${result.error}`);
        }
        
        return result;
    }
    
    /**
     * 获取交换指令 (模拟)
     */
    async getSwapInstruction(quote, takerAddress) {
        console.log('📝 模拟获取交换指令');
        
        const mockInstruction = {
            swapTransaction: '模拟交易数据',
            lastValidBlockHeight: Math.floor(Math.random() * 1000000) + 1000000,
            prioritizationFeeLamports: Math.floor(Math.random() * 10000) + 1000,
            computeUnitLimit: Math.floor(Math.random() * 200000) + 100000,
            taker: takerAddress,
            inputMint: quote.inputMint,
            outputMint: quote.outputMint,
            inAmount: quote.inAmount,
            outAmount: quote.outAmount,
            simulated: true
        };
        
        console.log(`   目标地址: ${takerAddress.substring(0, 8)}...`);
        console.log(`   计算单元限制: ${mockInstruction.computeUnitLimit}`);
        console.log(`   优先费用: ${mockInstruction.prioritizationFeeLamports} lamports`);
        
        return mockInstruction;
    }
    
    /**
     * 获取代币符号
     */
    _getTokenSymbol(mintAddress) {
        for (const [symbol, address] of Object.entries(this.tokens)) {
            if (address === mintAddress) {
                return symbol;
            }
        }
        return 'UNKNOWN';
    }
    
    /**
     * 格式化金额显示
     */
    _formatAmount(amount, mint) {
        const numAmount = Number(amount);
        const symbol = this._getTokenSymbol(mint);
        
        if (symbol === 'SOL') {
            return `${(numAmount / 1e9).toFixed(6)} SOL`;
        } else if (symbol === 'USDC' || symbol === 'USDT') {
            return `$${(numAmount / 1e6).toFixed(2)}`;
        } else if (symbol === 'BONK') {
            return `${(numAmount / 1e5).toFixed(0)}K BONK`;
        } else {
            return `${numAmount} ${symbol}`;
        }
    }
    
    /**
     * 获取价格影响严重程度
     */
    _getPriceImpactSeverity(priceImpactPercent) {
        if (priceImpactPercent < 0.1) return '极低';
        if (priceImpactPercent < 0.5) return '低';
        if (priceImpactPercent < 1.0) return '中等';
        if (priceImpactPercent < 2.0) return '高';
        return '极高';
    }
    
    /**
     * 获取价格影响建议
     */
    _getPriceImpactRecommendation(priceImpactPercent) {
        if (priceImpactPercent < 0.1) return '安全，可以交易';
        if (priceImpactPercent < 0.5) return '较安全，建议小额交易';
        if (priceImpactPercent < 1.0) return '风险中等，建议分批交易';
        if (priceImpactPercent < 2.0) return '风险较高，建议等待流动性改善';
        return '风险极高，不建议交易';
    }
}

module.exports = MockJupiterClient;