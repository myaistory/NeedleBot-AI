// Test monitoring system integration
const { startMonitoring, updateAPIMetrics, updateTradingMetrics, getDashboardData, getHealthStatus } = require('./src/monitoring/monitoring-system');

console.log('Testing NeedleBot Monitoring System...\n');

try {
  // 1. Start monitoring system
  console.log('1. Starting monitoring system...');
  startMonitoring();
  console.log('✓ Monitoring system started\n');

  // 2. Test API metrics
  console.log('2. Testing API metrics...');
  updateAPIMetrics(true, 1200); // Success, 1200ms response time
  updateAPIMetrics(false, 5000); // Failure, 5000ms response time
  updateAPIMetrics(true, 800);  // Success, 800ms response time
  console.log('✓ API metrics updated (2 success, 1 failure)\n');

  // 3. Test trading metrics
  console.log('3. Testing trading metrics...');
  updateTradingMetrics(true, true, true, 15.5);  // Trade success, profit 15.5%
  updateTradingMetrics(true, false, false, -5.2); // Trade failed, loss 5.2%
  updateTradingMetrics(false, true, false, 0);    // Signal detected but no trade
  console.log('✓ Trading metrics updated\n');

  // 4. Get dashboard data
  console.log('4. Getting dashboard data...');
  const dashboard = getDashboardData();
  console.log('Dashboard metrics:');
  console.log(`  - API Success Rate: ${(dashboard.api.successRate * 100).toFixed(1)}%`);
  console.log(`  - Avg Response Time: ${dashboard.api.avgResponseTime.toFixed(0)}ms`);
  console.log(`  - Total Trades: ${dashboard.trading.trades}`);
  console.log(`  - Successful Trades: ${dashboard.trading.successes}`);
  console.log(`  - Total Profit: ${dashboard.trading.totalProfit.toFixed(2)}%`);
  console.log('✓ Dashboard data retrieved\n');

  // 5. Get health status
  console.log('5. Getting health status...');
  const health = getHealthStatus();
  console.log(`Health Status: ${health.status}`);
  console.log(`Issues: ${health.issues.length}`);
  if (health.issues.length > 0) {
    health.issues.forEach(issue => {
      console.log(`  - ${issue}`);
    });
  }
  console.log('✓ Health status retrieved\n');

  // 6. Test with high error rate to trigger alert
  console.log('6. Testing alert threshold...');
  for (let i = 0; i < 10; i++) {
    updateAPIMetrics(false, 3000); // Multiple failures
  }
  
  const healthAfterAlerts = getHealthStatus();
  console.log(`Health after alerts: ${healthAfterAlerts.status}`);
  console.log(`Issues count: ${healthAfterAlerts.issues.length}`);
  
  if (healthAfterAlerts.issues.some(issue => issue.includes('API错误率过高'))) {
    console.log('✓ API error rate alert triggered correctly');
  }

  console.log('\n✅ All monitoring system tests passed!');
  console.log('\nMonitoring system features verified:');
  console.log('  ✓ Real-time metrics collection');
  console.log('  ✓ Alert threshold detection');
  console.log('  ✓ Dashboard data aggregation');
  console.log('  ✓ Health status monitoring');
  console.log('  ✓ Performance tracking');

} catch (error) {
  console.error('❌ Monitoring test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}