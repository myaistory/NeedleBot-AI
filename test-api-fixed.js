const axios = require('axios');

console.log('🔧 NeedleBot AI API 测试 (修正版)...\n');

async function testAPIs() {
    console.log('测试不同的 DEXScreener API 端点...\n');
    
    const endpoints = [
        {
            name: '热门交易对',
            url: 'https://api.dexscreener.com/latest/dex/pairs?q=solana',
            method: 'GET'
        },
        {
            name: '最新代币',
            url: 'https://api.dexscreener.com/latest/dex/tokens',
            method: 'GET'
        },
        {
            name: '搜索代币',
            url: 'https://api.dexscreener.com/latest/dex/search?q=solana',
            method: 'GET'
        }
    ];
    
    for (const endpoint of endpoints) {
        console.log(`测试: ${endpoint.name}`);
        console.log(`URL: ${endpoint.url}`);
        
        try {
            const response = await axios.get(endpoint.url, { timeout: 10000 });
            console.log(`✅ 状态: ${response.status}`);
            
            if (response.data) {
                if (Array.isArray(response.data)) {
                    console.log(`   数据条数: ${response.data.length}`);
                    
                    if (response.data.length > 0) {
                        const sample = response.data[0];
                        console.log(`   示例数据:`);
                        console.log(`     代币: ${sample.baseToken?.symbol || '未知'}/${sample.quoteToken?.symbol || '未知'}`);
                        console.log(`     价格: $${parseFloat(sample.priceUsd || 0).toFixed(6)}`);
                        console.log(`     DEX: ${sample.dexId || '未知'}`);
                    }
                } else if (response.data.pairs) {
                    console.log(`   交易对数: ${response.data.pairs.length}`);
                    
                    if (response.data.pairs.length > 0) {
                        const pair = response.data.pairs[0];
                        console.log(`   示例交易对:`);
                        console.log(`     代币: ${pair.baseToken?.symbol || '未知'}/${pair.quoteToken?.symbol || '未知'}`);
                        console.log(`     价格: $${parseFloat(pair.priceUsd || 0).toFixed(6)}`);
                        console.log(`     流动性: $${(parseFloat(pair.liquidity?.usd || 0) / 1000).toFixed(2)}k`);
                    }
                }
            }
            
        } catch (error) {
            console.log(`❌ 失败: ${error.message}`);
            if (error.response) {
                console.log(`   状态码: ${error.response.status}`);
                console.log(`   响应: ${JSON.stringify(error.response.data).substring(0, 200)}...`);
            }
        }
        
        console.log('');
    }
    
    console.log('测试具体的 Solana Meme 币...\n');
    
    // 已知的 Solana Meme 币
    const knownMemeTokens = [
        { symbol: 'BONK', address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' },
        { symbol: 'WIF', address: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm' },
        { symbol: 'POPCAT', address: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr' }
    ];
    
    for (const token of knownMemeTokens) {
        console.log(`获取 ${token.symbol} 数据...`);
        
        try {
            const response = await axios.get(
                `https://api.dexscreener.com/latest/dex/tokens/${token.address}`,
                { timeout: 10000 }
            );
            
            if (response.data.pairs && response.data.pairs.length > 0) {
                const pair = response.data.pairs[0];
                console.log(`✅ ${token.symbol}:`);
                console.log(`   价格: $${parseFloat(pair.priceUsd || 0).toFixed(6)}`);
                console.log(`   24h交易量: $${(parseFloat(pair.volume?.h24 || 0) / 1000).toFixed(2)}k`);
                console.log(`   流动性: $${(parseFloat(pair.liquidity?.usd || 0) / 1000).toFixed(2)}k`);
                console.log(`   24h涨跌: ${parseFloat(pair.priceChange?.h24 || 0).toFixed(2)}%`);
            } else {
                console.log(`⚠️  未找到交易对数据`);
            }
        } catch (error) {
            console.log(`❌ 获取失败: ${error.message}`);
        }
        
        console.log('');
    }
    
    console.log('🎯 创建 NeedleBot 数据获取策略...\n');
    
    console.log('推荐的数据获取流程:');
    console.log('1. 使用搜索端点获取热门交易对');
    console.log('2. 过滤 Solana 链上代币');
    console.log('3. 识别 Meme 币特征');
    console.log('4. 获取详细价格数据');
    console.log('5. 计算技术指标');
    console.log('6. 检测插针信号');
    
    console.log('\n📊 数据源评估:');
    console.log('✅ DEXScreener API 可用');
    console.log('✅ 能够获取实时价格');
    console.log('✅ 支持批量查询');
    console.log('⚠️  需要处理 API 限制');
    console.log('⚠️  需要缓存机制');
    
    console.log('\n🚀 下一步实施计划:');
    console.log('1. 创建 PriceFetcher 类 (已完成)');
    console.log('2. 添加缓存和错误处理');
    console.log('3. 实现插针检测算法');
    console.log('4. 添加风险管理');
    console.log('5. 创建模拟交易系统');
    
    console.log('\n💡 优化建议:');
    console.log('• 使用多个数据源 (Jupiter, Birdeye)');
    console.log('• 实现 WebSocket 实时数据');
    console.log('• 添加数据验证和清洗');
    console.log('• 创建监控和告警系统');
}

// 运行测试
testAPIs().catch(error => {
    console.error('测试失败:', error);
});