/**
 * 测试 RPC 管理器的优雅关闭
 */

const RPCNodeManager = require('./src/solana/rpc-manager');
const logger = require('./src/utils/logger');

async function testGracefulShutdown() {
    console.log('🚀 开始测试 RPC 管理器的优雅关闭...\n');
    
    try {
        // 1. 初始化管理器
        console.log('1. 初始化 RPC 管理器...');
        const rpcManager = new RPCNodeManager();
        await rpcManager.initialize();
        console.log('   ✅ 初始化成功\n');
        
        // 2. 等待一小段时间让健康检查运行
        console.log('2. 等待健康检查运行...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log('   ✅ 健康检查已运行\n');
        
        // 3. 检查节点状态
        console.log('3. 检查节点状态...');
        const nodes = rpcManager.nodes || [];
        const healthyNodes = nodes.filter(node => node.isHealthy).length;
        console.log(`   📊 健康节点: ${healthyNodes}/${nodes.length}`);
        
        // 4. 模拟快速停止（不等待）
        console.log('4. 模拟快速停止...');
        
        // 记录当前时间
        const startTime = Date.now();
        
        // 立即停止
        await rpcManager.stop();
        
        const stopTime = Date.now() - startTime;
        console.log(`   ✅ 停止完成，耗时: ${stopTime}ms`);
        
        // 5. 验证节点状态
        console.log('5. 验证节点状态...');
        const nodesAfterStop = rpcManager.nodes || [];
        const unhealthyNodes = nodesAfterStop.filter(node => !node.isHealthy).length;
        
        if (unhealthyNodes === 0) {
            console.log('   ✅ 所有节点保持健康状态');
        } else {
            console.log(`   ❌ ${unhealthyNodes} 个节点被错误标记为不健康`);
        }
        
        // 6. 验证管理器状态
        console.log('6. 验证管理器状态...');
        if (!rpcManager.initialized) {
            console.log('   ✅ 管理器已正确停止 (initialized = false)');
        } else {
            console.log('   ❌ 管理器未正确停止 (initialized = true)');
        }
        
        if (rpcManager.isStopping) {
            console.log('   ✅ 停止标志已设置 (isStopping = true)');
        } else {
            console.log('   ❌ 停止标志未设置 (isStopping = false)');
        }
        
        console.log('\n🎉 优雅关闭测试完成！');
        return true;
        
    } catch (error) {
        console.error('❌ 测试失败:', error);
        return false;
    }
}

// 运行测试
testGracefulShutdown().then(success => {
    process.exit(success ? 0 : 1);
});