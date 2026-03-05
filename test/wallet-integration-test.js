/**
 * 钱包集成测试脚本
 * 测试钱包配置和集成功能
 */

const { walletIntegration } = require('../src/integration/wallet-integration');
const logger = require('../src/utils/logger');

class WalletIntegrationTest {
    constructor() {
        this.testResults = {
            total: 0,
            passed: 0,
            failed: 0,
            details: []
        };
    }
    
    async runAllTests() {
        console.log('🧪 开始钱包集成测试');
        console.log('='.repeat(60));
        
        try {
            // 测试1: 初始化测试
            await this.testInitialization();
            
            // 测试2: 钱包状态测试
            await this.testWalletStatus();
            
            // 测试3: Jupiter API测试
            await this.testJupiterAPI();
            
            // 测试4: 报价功能测试
            await this.testQuoteFunction();
            
            // 测试5: NeedleBot集成测试
            await this.testNeedleBotIntegration();
            
            // 测试6: 安全关闭测试
            await this.testShutdown();
            
            // 输出测试报告
            this.printTestReport();
            
        } catch (error) {
            console.error('❌ 测试执行失败:', error.message);
            this.testResults.failed++;
            this.printTestReport();
        }
    }
    
    async testInitialization() {
        this.startTest('初始化测试');
        
        try {
            const initialized = await walletIntegration.initialize();
            
            if (initialized) {
                this.passTest('钱包集成系统初始化成功');
            } else {
                this.failTest('钱包集成系统初始化失败');
            }
            
        } catch (error) {
            this.failTest(`初始化异常: ${error.message}`);
        }
    }
    
    async testWalletStatus() {
        this.startTest('钱包状态测试');
        
        try {
            const status = walletIntegration.getStatus();
            
            if (status.initialized && status.wallet.address) {
                this.passTest(`钱包状态正常，地址: ${status.wallet.address}`);
                console.log(`   📊 余额: ${status.wallet.balanceSOL.toFixed(6)} SOL`);
                console.log(`   💰 USD价值: $${status.wallet.balanceUSD.toFixed(2)}`);
                console.log(`   ✅ 就绪状态: ${status.wallet.isReady ? '是' : '否'}`);
            } else {
                this.failTest('钱包状态异常');
            }
            
        } catch (error) {
            this.failTest(`钱包状态测试异常: ${error.message}`);
        }
    }
    
    async testJupiterAPI() {
        this.startTest('Jupiter API测试');
        
        try {
            // 通过获取状态来间接测试Jupiter API
            const status = walletIntegration.getStatus();
            
            if (status.integrations.jupiter) {
                this.passTest('Jupiter API连接正常');
            } else {
                this.failTest('Jupiter API连接失败');
            }
            
        } catch (error) {
            this.failTest(`Jupiter API测试异常: ${error.message}`);
        }
    }
    
    async testQuoteFunction() {
        this.startTest('报价功能测试');
        
        try {
            const quoteResult = await walletIntegration.getQuote(
                'So11111111111111111111111111111111111111112', // SOL
                'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
                0.001, // 0.001 SOL
                100 // 1% 滑点
            );
            
            if (quoteResult.success && quoteResult.quote) {
                this.passTest('报价功能正常');
                
                const inAmount = parseInt(quoteResult.quote.inAmount) / 1_000_000_000;
                const outAmount = parseInt(quoteResult.quote.outAmount) / 1_000_000;
                const rate = outAmount / inAmount;
                
                console.log(`   📥 输入: ${inAmount.toFixed(6)} SOL`);
                console.log(`   📤 输出: ${outAmount.toFixed(6)} USDC`);
                console.log(`   💱 汇率: 1 SOL = ${rate.toFixed(6)} USDC`);
                console.log(`   💰 价值: $${quoteResult.amountUSD.toFixed(4)}`);
                
            } else {
                this.failTest(`报价功能失败: ${quoteResult.error || '未知错误'}`);
            }
            
        } catch (error) {
            this.failTest(`报价功能测试异常: ${error.message}`);
        }
    }
    
    async testNeedleBotIntegration() {
        this.startTest('NeedleBot集成测试');
        
        try {
            const integrated = await walletIntegration.integrateWithNeedleBot();
            
            if (integrated) {
                this.passTest('NeedleBot集成成功');
            } else {
                this.warnTest('NeedleBot集成失败（可能系统未运行）');
            }
            
        } catch (error) {
            this.failTest(`NeedleBot集成测试异常: ${error.message}`);
        }
    }
    
    async testShutdown() {
        this.startTest('安全关闭测试');
        
        try {
            await walletIntegration.shutdown();
            
            // 验证已关闭
            const status = walletIntegration.getStatus();
            
            if (!status.initialized) {
                this.passTest('安全关闭成功');
            } else {
                this.failTest('安全关闭失败，系统仍处于初始化状态');
            }
            
        } catch (error) {
            this.failTest(`安全关闭测试异常: ${error.message}`);
        }
    }
    
    // 测试辅助方法
    startTest(testName) {
        console.log(`\n🔧 测试: ${testName}`);
        this.testResults.total++;
    }
    
    passTest(message) {
        console.log(`   ✅ ${message}`);
        this.testResults.passed++;
        this.testResults.details.push({
            test: this.testResults.total,
            status: 'PASSED',
            message: message
        });
    }
    
    failTest(message) {
        console.log(`   ❌ ${message}`);
        this.testResults.failed++;
        this.testResults.details.push({
            test: this.testResults.total,
            status: 'FAILED',
            message: message
        });
    }
    
    warnTest(message) {
        console.log(`   ⚠️  ${message}`);
        this.testResults.details.push({
            test: this.testResults.total,
            status: 'WARNING',
            message: message
        });
    }
    
    printTestReport() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 钱包集成测试报告');
        console.log('='.repeat(60));
        
        const successRate = (this.testResults.passed / this.testResults.total * 100).toFixed(1);
        
        console.log(`📈 测试统计:`);
        console.log(`   总计: ${this.testResults.total} 个测试`);
        console.log(`   通过: ${this.testResults.passed}`);
        console.log(`   失败: ${this.testResults.failed}`);
        console.log(`   成功率: ${successRate}%`);
        
        console.log('\n📋 详细结果:');
        this.testResults.details.forEach((detail, index) => {
            const statusIcon = detail.status === 'PASSED' ? '✅' : 
                              detail.status === 'FAILED' ? '❌' : '⚠️';
            console.log(`   ${statusIcon} 测试 ${index + 1}: ${detail.message}`);
        });
        
        console.log('\n' + '='.repeat(60));
        
        // 保存测试结果
        this.saveTestResults();
        
        // 退出码
        if (this.testResults.failed > 0) {
            process.exit(1);
        } else {
            process.exit(0);
        }
    }
    
    saveTestResults() {
        try {
            const fs = require('fs');
            const path = require('path');
            
            const resultsDir = path.join(__dirname, '../test-results');
            if (!fs.existsSync(resultsDir)) {
                fs.mkdirSync(resultsDir, { recursive: true });
            }
            
            const resultFile = path.join(resultsDir, 'wallet-integration-test-result.json');
            const resultData = {
                ...this.testResults,
                timestamp: new Date().toISOString(),
                system: 'NeedleBot AI Wallet Integration',
                version: '1.0.0'
            };
            
            fs.writeFileSync(resultFile, JSON.stringify(resultData, null, 2));
            console.log(`📁 测试结果已保存到: ${resultFile}`);
            
        } catch (error) {
            console.error('保存测试结果失败:', error.message);
        }
    }
}

// 运行测试
async function main() {
    console.log('🚀 NeedleBot AI 钱包集成测试');
    console.log('版本: 1.0.0 | 日期: 2026-02-27');
    console.log('='.repeat(60));
    
    const test = new WalletIntegrationTest();
    await test.runAllTests();
}

// 执行
if (require.main === module) {
    main().catch(error => {
        console.error('❌ 测试执行失败:', error);
        process.exit(1);
    });
}

module.exports = WalletIntegrationTest;