#!/usr/bin/env node
/**
 * 验证修复的测试脚本
 */

const JupiterClient = require('../src/trading/jupiter-client');
const { OrderManager, OrderType } = require('../src/trading/order-manager');

async function verifyFixes() {
    console.log('🔍 验证修复...\n');
    
    const config = {
        jupiter: {
            baseUrl: 'https://api.jup.ag',
            apiKey: 'ddc333e0-5736-43c0-b0fb-5ba6c8823e5e',
            timeout: 10000,
            maxRetries: 3,
            retryDelay: 1000,
            endpoints: {
                quote: '/swap/v1/quote',
                swap: '/swap/v1/swap',
                tokens: '/tokens/v1',
                price: '/price/v3'
            }
        },
        rpc: {
            endpoint: 'https://purple-wiser-tab.solana-mainnet.quiknode.pro',
            timeout: 5000
        },
        trading: {
            defaultSlippageBps: 50,
            maxSlippageBps: 100,
            minLiquidity: 1000
        }
    };

    try {
        // 1. 测试JupiterClient
        console.log('1. 测试JupiterClient初始化...');
        const jupiterClient = new JupiterClient(config);
        console.log('✅ JupiterClient初始化成功\n');

        // 2. 测试axiosInstance
        console.log('2. 测试axiosInstance...');
        if (jupiterClient.axiosInstance) {
            console.log('✅ axiosInstance存在\n');
        } else {
            console.log('❌ axiosInstance不存在\n');
            return false;
        }

        // 3. 测试报价获取
        console.log('3. 测试报价获取...');
        const quote = await jupiterClient.getQuote(
            'So11111111111111111111111111111111111111112',
            'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            1000000000, // 1 SOL
            50
        );
        console.log('✅ 报价获取成功\n');

        // 4. 测试OrderManager
        console.log('4. 测试OrderManager初始化...');
        const orderManager = new OrderManager(config);
        console.log('✅ OrderManager初始化成功\n');

        // 5. 测试订单创建
        console.log('5. 测试订单创建...');
        const order = await orderManager.createOrder(
            OrderType.BUY,
            'So11111111111111111111111111111111111111112',
            'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            0.1 * 1e9, // 0.1 SOL
            { slippageBps: 50 }
        );
        
        if (order && order.id) {
            console.log(`✅ 订单创建成功: ${order.id}\n`);
        } else {
            console.log('❌ 订单创建失败\n');
            return false;
        }

        // 6. 测试getOrder方法
        console.log('6. 测试getOrder方法...');
        const orderStatus = orderManager.getOrder(order.id);
        if (orderStatus) {
            console.log(`✅ getOrder成功: ${orderStatus.status}\n`);
        } else {
            console.log('❌ getOrder失败\n');
            return false;
        }

        // 7. 测试统计信息
        console.log('7. 测试统计信息...');
        const stats = orderManager.getStats();
        console.log(`✅ 统计信息: 总订单=${stats.totalOrders}, 活跃订单=${stats.activeOrders}\n`);

        console.log('🎉 所有修复验证通过！');
        return true;

    } catch (error) {
        console.error('❌ 验证失败:', error.message);
        console.error('堆栈:', error.stack);
        return false;
    }
}

// 运行验证
(async () => {
    const success = await verifyFixes();
    process.exit(success ? 0 : 1);
})();