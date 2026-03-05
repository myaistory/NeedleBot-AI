/**
 * 简单的优雅关闭测试
 */

const RPCNodeManager = require('./src/solana/rpc-manager');

async function testShutdown() {
    console.log('🚀 测试 RPC 管理器优雅关闭...\n');
    
    const rpcManager = new RPCNodeManager();
    
    try {
        // 1. 初始化
        console.log('1. 初始化 RPC 管理器...');
        await rpcManager.initialize();
        console.log('   ✅ 初始化成功\n');
        
        // 2. 立即停止（不等待健康检查）
        console.log('2. 立即停止 RPC 管理器...');
        const startTime = Date.now();
        await rpcManager.stop();
        const stopTime = Date.now() - startTime;
        console.log(`   ✅ 停止完成，耗时: ${stopTime}ms\n`);
        
        // 3. 验证状态
        console.log('3. 验证状态...');
        
        // 检查停止标志
        if (rpcManager.isStopping) {
            console.log('   ✅ isStopping = true');
        } else {
            console.log('   ❌ isStopping = false');
        }
        
        // 检查初始化状态
        if (!rpcManager.initialized) {
            console.log('   ✅ initialized = false');
        } else {
            console.log('   ❌ initialized = true');
        }
        
        // 检查健康检查间隔
        if (!rpcManager.healthCheckInterval) {
            console.log('   ✅ healthCheckInterval = null');
        } else {
            console.log('   ❌ healthCheckInterval 仍然存在');
        }
        
        // 检查节点状态
        const unhealthyNodes = rpcManager.nodes.filter(node => !node.isHealthy).length;
        if (unhealthyNodes === 0) {
            console.log('   ✅ 所有节点保持健康状态');
        } else {
            console.log(`   ❌ ${unhealthyNodes} 个节点被错误标记为不健康`);
        }
        
        console.log('\n🎉 测试完成！');
        return true;
        
    } catch (error) {
        console.error('❌ 测试失败:', error);
        return false;
    }
}

// 运行测试
testShutdown().then(success => {
    process.exit(success ? 0 : 1);
});