const NeedleBotAI = require('../src/index');
const logger = require('../src/utils/logger');

async function runBasicTest() {
    console.log('🧪 开始 NeedleBot AI 基础测试...\n');
    
    try {
        // 1. 创建系统实例
        const bot = new NeedleBotAI({
            scanIntervalMs: 10000, // 10秒扫描
            tradingEnabled: false, // 禁用交易
            initialBalanceSOL: 10.0 // 测试余额
        });
        
        console.log('✅ 系统实例创建成功');
        
        // 2. 获取系统信息
        const systemInfo = bot.getSystemInfo();
        console.log('📊 系统信息:');
        console.log(JSON.stringify(systemInfo, null, 2));
        
        // 3. 测试价格获取器
        console.log('\n🔍 测试价格获取...');
        const PriceFetcher = require('../src/core/price-fetcher');
        const fetcher = new PriceFetcher();
        
        const tokens = await fetcher.getSolanaMemeTokens();
        console.log(`✅ 获取到 ${tokens.length} 个Meme币`);
        
        if (tokens.length > 0) {
            const sampleToken = tokens[0];
            console.log(`示例代币: ${sampleToken.symbol} (${sampleToken.address})`);
            
            const price = await fetcher.getTokenPrice(sampleToken.address);
            if (price) {
                console.log(`价格: $${price.priceUSD}, 流动性: $${price.liquidity}`);
            }
        }
        
        // 4. 测试策略检测器
        console.log('\n🎯 测试策略检测...');
        const NeedleDetector = require('../src/strategy/needle-detector');
        const detector = new NeedleDetector();
        
        // 生成测试数据
        const testHistory = [];
        const basePrice = 1.0;
        const now = Date.now();
        
        // 模拟一个插针形态
        for (let i = 0; i < 30; i++) {
            const timestamp = now - ((30 - i) * 10000); // 10秒间隔
            let price = basePrice;
            
            if (i === 15) {
                price = basePrice * 0.7; // 30%跌幅
            } else if (i > 15 && i < 20) {
                price = basePrice * 0.7 + (i - 15) * 0.06; // 快速回升
            } else if (i >= 20) {
                price = basePrice * 0.9; // 回升到90%
            }
            
            // 添加随机波动
            price *= (1 + (Math.random() - 0.5) * 0.02);
            
            testHistory.push({
                timestamp,
                price,
                volume: 100000 + Math.random() * 50000
            });
        }
        
        const detection = await detector.detectNeedle(testHistory);
        console.log('检测结果:');
        console.log(JSON.stringify(detection, null, 2));
        
        // 5. 测试风控管理器
        console.log('\n🛡️ 测试风控管理...');
        const RiskManager = require('../src/risk/risk-manager');
        const riskManager = new RiskManager();
        
        const testSignal = {
            confidence: 85,
            analysis: {
                dropPercentage: 30,
                recoveryEstimate: 60
            }
        };
        
        const testTokenAddress = 'test_address_123';
        const riskAssessment = await riskManager.assessRisk(
            testTokenAddress,
            testSignal,
            0.1 // 0.1 SOL
        );
        
        console.log('风险评估:');
        console.log(JSON.stringify(riskAssessment, null, 2));
        
        // 6. 测试模拟交易
        console.log('\n💰 测试模拟交易...');
        const PaperTrading = require('../src/simulation/paper-trading');
        const trading = new PaperTrading({
            initialBalanceSOL: 5.0,
            dataDir: './test-data'
        });
        
        // 测试开仓
        const testTrade = await trading.executeTrade(
            testSignal,
            {
                address: testTokenAddress,
                symbol: 'TEST',
                name: 'Test Token'
            },
            0.5, // 0.5 SOL
            1.0  // 价格 $1.0
        );
        
        console.log('交易结果:');
        console.log(JSON.stringify(testTrade, null, 2));
        
        // 生成报告
        const report = trading.generateReport();
        console.log('\n📈 交易报告:');
        console.log(JSON.stringify(report, null, 2));
        
        console.log('\n🎉 所有测试通过！');
        
        // 清理测试数据
        require('fs').promises.rm('./test-data', { recursive: true, force: true })
            .then(() => console.log('🧹 测试数据已清理'))
            .catch(() => {});
            
    } catch (error) {
        console.error('❌ 测试失败:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

// 运行测试
runBasicTest().catch(error => {
    console.error('测试运行失败:', error);
    process.exit(1);
});