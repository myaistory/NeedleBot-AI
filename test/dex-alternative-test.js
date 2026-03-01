#!/usr/bin/env node
/**
 * DEX 替代方案测试
 * 
 * 如果 Jupiter API 需要认证，测试其他 DEX 聚合器
 */

const axios = require('axios');

// 不同的 DEX 聚合器端点
const DEX_APIS = {
    // Jupiter 备用端点
    jupiter1: 'https://quote-api.jup.ag/v6',
    jupiter2: 'https://api.jup.ag/v6',
    
    // Raydium API
    raydium: 'https://api.raydium.io/v2',
    
    // Orca API (Whirlpools)
    orca: 'https://api.orca.so',
    
    // 1inch (支持 Solana)
    oneinch: 'https://api.1inch.io/v5.0',
    
    // OpenOcean
    openocean: 'https://open-api.openocean.finance/v3'
};

// 常用代币地址
const TOKENS = {
    SOL: 'So11111111111111111111111111111111111111112',
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
};

async function testDexAPI(name, baseUrl) {
    console.log(`\n🔗 测试 ${name}: ${baseUrl}`);
    
    const axiosInstance = axios.create({
        baseURL: baseUrl,
        timeout: 10000,
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    });
    
    try {
        // 测试根端点
        const rootResponse = await axiosInstance.get('/');
        console.log(`   ✅ 连接成功 (${rootResponse.status})`);
        
        // 尝试获取代币列表或简单信息
        if (name.includes('jupiter')) {
            try {
                const tokensResponse = await axiosInstance.get('/tokens');
                console.log(`   📋 代币列表: ${tokensResponse.data?.length || 0} 个代币`);
                return { name, status: 'available', tokens: tokensResponse.data?.length };
            } catch (error) {
                console.log(`   ⚠️  需要认证: ${error.response?.status || error.code}`);
                return { name, status: 'needs_auth', error: error.message };
            }
        }
        
        return { name, status: 'available' };
        
    } catch (error) {
        const status = error.response?.status || error.code;
        console.log(`   ❌ 连接失败: ${status || error.message}`);
        return { name, status: 'unavailable', error: error.message };
    }
}

async function testPriceAPIs() {
    console.log('🚀 测试 DEX 聚合器 API 可用性');
    console.log('='.repeat(70));
    console.log('📅 测试时间:', new Date().toISOString());
    console.log('='.repeat(70));
    
    const results = [];
    
    // 测试所有 DEX API
    for (const [name, url] of Object.entries(DEX_APIS)) {
        const result = await testDexAPI(name, url);
        results.push(result);
        await new Promise(resolve => setTimeout(resolve, 1000)); // 避免速率限制
    }
    
    // 测试公共价格 API 作为备选
    console.log('\n💰 测试公共价格 API');
    
    // CoinGecko API (免费，无需认证)
    try {
        const cgResponse = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
            params: {
                ids: 'solana',
                vs_currencies: 'usd'
            },
            timeout: 5000
        });
        console.log(`   ✅ CoinGecko: SOL = $${cgResponse.data.solana.usd}`);
        results.push({ name: 'coingecko', status: 'available', price: cgResponse.data.solana.usd });
    } catch (error) {
        console.log(`   ❌ CoinGecko: ${error.message}`);
        results.push({ name: 'coingecko', status: 'unavailable', error: error.message });
    }
    
    // CoinMarketCap API (需要密钥)
    try {
        const cmcResponse = await axios.get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest', {
            params: { symbol: 'SOL' },
            headers: { 'X-CMC_PRO_API_KEY': 'demo' }, // 演示密钥
            timeout: 5000
        });
        console.log(`   ✅ CoinMarketCap: 需要有效 API 密钥`);
        results.push({ name: 'coinmarketcap', status: 'needs_key' });
    } catch (error) {
        if (error.response?.status === 401) {
            console.log(`   🔑 CoinMarketCap: 需要 API 密钥`);
            results.push({ name: 'coinmarketcap', status: 'needs_key' });
        } else {
            console.log(`   ❌ CoinMarketCap: ${error.message}`);
            results.push({ name: 'coinmarketcap', status: 'unavailable', error: error.message });
        }
    }
    
    // 总结
    console.log('\n' + '='.repeat(70));
    console.log('📊 测试结果总结');
    console.log('='.repeat(70));
    
    const available = results.filter(r => r.status === 'available');
    const needsAuth = results.filter(r => r.status === 'needs_auth' || r.status === 'needs_key');
    const unavailable = results.filter(r => r.status === 'unavailable');
    
    console.log(`✅ 可用: ${available.length}`);
    available.forEach(r => {
        console.log(`   ${r.name}: ${r.price ? `$${r.price}` : '可用'} ${r.tokens ? `(${r.tokens} tokens)` : ''}`);
    });
    
    console.log(`🔑 需要认证/密钥: ${needsAuth.length}`);
    needsAuth.forEach(r => {
        console.log(`   ${r.name}: 需要认证`);
    });
    
    console.log(`❌ 不可用: ${unavailable.length}`);
    unavailable.forEach(r => {
        console.log(`   ${r.name}: ${r.error?.slice(0, 50)}...`);
    });
    
    console.log('\n💡 建议方案:');
    
    if (available.length > 0) {
        console.log('   1. 使用可用的 DEX API:');
        available.forEach(r => {
            console.log(`      - ${r.name}: ${DEX_APIS[r.name] || '公共API'}`);
        });
    }
    
    if (needsAuth.length > 0) {
        console.log('   2. 考虑获取 API 密钥:');
        needsAuth.forEach(r => {
            if (r.name === 'jupiter1' || r.name === 'jupiter2') {
                console.log(`      - Jupiter: https://station.jup.ag/docs/swap-api/getting-started`);
            } else if (r.name === 'coinmarketcap') {
                console.log(`      - CoinMarketCap: https://coinmarketcap.com/api/`);
            }
        });
    }
    
    console.log('   3. 使用公共价格 API + 自定义交易逻辑');
    console.log('   4. 考虑使用 WebSocket 实时数据');
    
    console.log('\n🔧 技术方案:');
    console.log('   A. 短期: 使用 CoinGecko + 模拟交易');
    console.log('   B. 中期: 获取 Jupiter API 密钥');
    console.log('   C. 长期: 集成多个 DEX，实现最优价格路由');
    
    console.log('\n' + '='.repeat(70));
    
    return {
        success: available.length > 0,
        results,
        recommendations: {
            immediate: available.map(r => r.name),
            needsAuth: needsAuth.map(r => r.name),
            unavailable: unavailable.map(r => r.name)
        }
    };
}

// 运行测试
if (require.main === module) {
    testPriceAPIs()
        .then(results => {
            if (results.success) {
                console.log('\n🎉 找到可用的 DEX/价格 API！');
                console.log('💡 可以开始集成真实交易测试。');
                process.exit(0);
            } else {
                console.log('\n⚠️  没有找到可用的 DEX API，需要获取 API 密钥。');
                console.log('📋 下一步:');
                console.log('   1. 注册 Jupiter 开发者账户获取 API 密钥');
                console.log('   2. 或使用模拟交易模式继续开发');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('💥 测试执行失败:', error);
            process.exit(1);
        });
}

module.exports = { testPriceAPIs, DEX_APIS, TOKENS };