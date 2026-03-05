// 测试NeedleBot API集成
const http = require('http');

// 测试NeedleBot状态
function testNeedleBotStatus() {
    console.log('🔍 测试NeedleBot系统状态...');
    
    // 检查进程是否运行
    const { execSync } = require('child_process');
    try {
        const psOutput = execSync('ps aux | grep "node src/index.js start" | grep -v grep').toString();
        if (psOutput.includes('node src/index.js start')) {
            console.log('✅ NeedleBot主程序正在运行');
            
            // 尝试获取系统信息
            const needlebot = require('./src/index.js');
            const bot = new needlebot();
            const info = bot.getSystemInfo();
            console.log('📊 NeedleBot系统信息:');
            console.log(JSON.stringify(info, null, 2));
        } else {
            console.log('❌ NeedleBot主程序未运行');
        }
    } catch (error) {
        console.log('❌ 检查进程时出错:', error.message);
    }
}

// 测试前端API
function testFrontendAPI() {
    console.log('\n🔍 测试前端API端点...');
    
    const options = {
        hostname: 'localhost',
        port: 80,
        path: '/api/dashboard',
        method: 'GET',
        headers: {
            'Accept': 'application/json'
        }
    };
    
    const req = http.request(options, (res) => {
        console.log(`📡 API状态码: ${res.statusCode}`);
        
        let data = '';
        res.on('data', (chunk) => {
            data += chunk;
        });
        
        res.on('end', () => {
            try {
                const jsonData = JSON.parse(data);
                console.log('✅ API响应成功');
                console.log(`📊 核心节点数量: ${jsonData.data.processNodes.length}`);
                console.log(`📈 交易信号数量: ${jsonData.data.signals.length}`);
                console.log(`💰 交易记录数量: ${jsonData.data.trades.length}`);
                console.log(`⚠️  错误数量: ${jsonData.data.errors.length}`);
            } catch (error) {
                console.log('❌ 解析API响应失败:', error.message);
            }
        });
    });
    
    req.on('error', (error) => {
        console.log('❌ API请求失败:', error.message);
    });
    
    req.end();
}

// 测试系统集成
function testSystemIntegration() {
    console.log('\n🔍 测试系统集成状态...');
    
    // 检查所有运行的服务
    const services = [
        { name: 'Nginx Web服务器', port: 80 },
        { name: '前端Node.js服务器', port: 3001 },
        { name: 'NeedleBot主程序', check: 'process' }
    ];
    
    services.forEach(service => {
        if (service.port) {
            const net = require('net');
            const client = new net.Socket();
            
            client.setTimeout(2000);
            
            client.on('connect', () => {
                console.log(`✅ ${service.name} (端口 ${service.port}) 运行正常`);
                client.destroy();
            });
            
            client.on('timeout', () => {
                console.log(`❌ ${service.name} (端口 ${service.port}) 连接超时`);
                client.destroy();
            });
            
            client.on('error', () => {
                console.log(`❌ ${service.name} (端口 ${service.port}) 无法连接`);
            });
            
            client.connect(service.port, 'localhost');
        } else if (service.check === 'process') {
            const { execSync } = require('child_process');
            try {
                const output = execSync('ps aux | grep "node src/index.js" | grep -v grep | wc -l').toString().trim();
                if (parseInt(output) > 0) {
                    console.log(`✅ ${service.name} 正在运行`);
                } else {
                    console.log(`❌ ${service.name} 未运行`);
                }
            } catch (error) {
                console.log(`❌ 检查${service.name}时出错:`, error.message);
            }
        }
    });
}

// 运行所有测试
console.log('🚀 开始NeedleBot真实交易系统测试...\n');
testNeedleBotStatus();
setTimeout(testFrontendAPI, 1000);
setTimeout(testSystemIntegration, 2000);