#!/usr/bin/env node

/**
 * Performance Benchmark Runner
 * Demonstrates the performance improvements of the optimized cash clearing system
 */

import { BenchmarkSuite } from './BenchmarkSuite.js';
import { logger } from '../../utils/logger.js';

/**
 * Main benchmark execution function
 */
async function runPerformanceBenchmarks() {
  console.log('🚀 Starting Cash Clearing Performance Benchmarks');
  console.log('=' .repeat(60));
  
  try {
    // Initialize benchmark suite with comprehensive test configuration
    const benchmarkSuite = new BenchmarkSuite({
      warmupRuns: 3,
      benchmarkRuns: 10,
      datasetSizes: [100, 500, 1000, 5000, 10000],
      timeoutMs: 300000, // 5 minutes
      enableDetailedLogging: true
    });

    // Run complete benchmark suite
    const startTime = Date.now();
    const report = await benchmarkSuite.runCompleteBenchmark();
    const totalTime = Date.now() - startTime;

    // Display results
    displayBenchmarkResults(report, totalTime);
    
    // Generate recommendations
    displayRecommendations(report);
    
    console.log('\n✅ Benchmark suite completed successfully!');
    
  } catch (error) {
    console.error('❌ Benchmark suite failed:', error.message);
    process.exit(1);
  }
}

/**
 * Display benchmark results in a formatted table
 */
function displayBenchmarkResults(report, totalTime) {
  console.log('\n📊 Performance Benchmark Results');
  console.log('=' .repeat(60));
  
  // Summary table
  console.log('\n🎯 Executive Summary:');
  console.log(`Total Execution Time: ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`Overall Performance Improvement: ${report.summary.overallImprovement.toFixed(1)}%`);
  console.log(`Datasets Tested: ${report.summary.totalDatasets}`);
  console.log(`Total Test Runs: ${report.summary.totalRuns}`);
  
  // Detailed results table
  console.log('\n📈 Detailed Performance Results:');
  console.log('─'.repeat(100));
  console.log('| Dataset | Baseline Avg | Optimized Avg | Improvement | Throughput Gain | Reliability |');
  console.log('|---------|--------------|---------------|-------------|-----------------|-------------|');
  
  for (const [datasetSize, results] of Object.entries(report.detailedResults)) {
    const baseline = results.baseline;
    const optimized = results.optimized;
    const comparison = results.comparison;
    
    console.log(
      `| ${datasetSize.padEnd(7)} | ` +
      `${baseline.averageTime.toString().padEnd(12)} | ` +
      `${optimized.averageTime.toString().padEnd(13)} | ` +
      `${comparison.performanceImprovement.toFixed(1).padEnd(11)}% | ` +
      `${comparison.throughputImprovement.toFixed(1).padEnd(15)}% | ` +
      `${optimized.successRate.padEnd(11)} |`
    );
  }
  console.log('─'.repeat(100));
  
  // Throughput comparison
  console.log('\n🔥 Throughput Performance (Transactions per Minute):');
  console.log('─'.repeat(80));
  console.log('| Dataset | Baseline | Optimized | Improvement | Target Met |');
  console.log('|---------|----------|-----------|-------------|------------|');
  
  for (const [datasetSize, results] of Object.entries(report.detailedResults)) {
    const baseline = results.baseline;
    const optimized = results.optimized;
    const comparison = results.comparison;
    const targetMet = optimized.throughputPerMinute >= 833 ? '✅ Yes' : '❌ No'; // 50k/hour = 833/min
    
    console.log(
      `| ${datasetSize.padEnd(7)} | ` +
      `${baseline.throughputPerMinute.toString().padEnd(8)} | ` +
      `${optimized.throughputPerMinute.toString().padEnd(9)} | ` +
      `${comparison.throughputImprovement.toFixed(1).padEnd(11)}% | ` +
      `${targetMet.padEnd(10)} |`
    );
  }
  console.log('─'.repeat(80));
  
  // Response time analysis
  console.log('\n⚡ Response Time Analysis (P95):');
  console.log('─'.repeat(70));
  console.log('| Dataset | Baseline | Optimized | Reduction | SLA Met |');
  console.log('|---------|----------|-----------|-----------|---------|');
  
  for (const [datasetSize, results] of Object.entries(report.detailedResults)) {
    const baseline = results.baseline;
    const optimized = results.optimized;
    const reduction = ((baseline.p95Time - optimized.p95Time) / baseline.p95Time * 100).toFixed(1);
    const slaMet = optimized.p95Time <= 200 ? '✅ Yes' : '❌ No'; // 200ms SLA
    
    console.log(
      `| ${datasetSize.padEnd(7)} | ` +
      `${baseline.p95Time.toString().padEnd(8)} | ` +
      `${optimized.p95Time.toString().padEnd(9)} | ` +
      `${reduction.padEnd(9)}% | ` +
      `${slaMet.padEnd(7)} |`
    );
  }
  console.log('─'.repeat(70));
}

/**
 * Display optimization recommendations
 */
function displayRecommendations(report) {
  console.log('\n💡 Optimization Recommendations:');
  console.log('=' .repeat(60));
  
  // Global recommendations
  if (report.recommendations && report.recommendations.length > 0) {
    console.log('\n🌟 Global Recommendations:');
    report.recommendations.forEach((rec, index) => {
      const priority = rec.priority === 'HIGH' ? '🔴' : rec.priority === 'MEDIUM' ? '🟡' : '🟢';
      console.log(`${index + 1}. ${priority} [${rec.type}] ${rec.message}`);
    });
  }
  
  // Dataset-specific recommendations
  console.log('\n📋 Dataset-Specific Recommendations:');
  for (const [datasetSize, results] of Object.entries(report.detailedResults)) {
    if (results.recommendation && results.recommendation.length > 0) {
      console.log(`\n📌 Dataset ${datasetSize}:`);
      results.recommendation.forEach((rec, index) => {
        const priority = rec.priority === 'HIGH' ? '🔴' : rec.priority === 'MEDIUM' ? '🟡' : '🟢';
        console.log(`   ${index + 1}. ${priority} [${rec.type}] ${rec.message}`);
      });
    }
  }
  
  // Configuration recommendations
  if (report.summary.recommendedConfiguration) {
    console.log('\n⚙️  Recommended Production Configuration:');
    const config = report.summary.recommendedConfiguration;
    console.log(`   Batch Size: ${config.recommendedBatchSize}`);
    console.log(`   Concurrency: ${config.recommendedConcurrency}`);
    console.log(`   Optimizations: ${config.enableOptimizations ? 'Enabled' : 'Disabled'}`);
    console.log(`   Monitoring: ${config.monitoringRequired ? 'Required' : 'Optional'}`);
  }
}

/**
 * Run specific benchmark scenario
 */
async function runSpecificScenario(scenarioName, options = {}) {
  console.log(`\n🎯 Running ${scenarioName} Scenario`);
  console.log('─'.repeat(50));
  
  const benchmarkSuite = new BenchmarkSuite({
    warmupRuns: 2,
    benchmarkRuns: 5,
    enableDetailedLogging: false,
    ...options
  });
  
  try {
    const report = await benchmarkSuite.runCompleteBenchmark();
    
    console.log(`✅ ${scenarioName} completed:`);
    console.log(`   Average Improvement: ${report.summary.overallImprovement.toFixed(1)}%`);
    
    return report;
  } catch (error) {
    console.error(`❌ ${scenarioName} failed:`, error.message);
    return null;
  }
}

/**
 * Performance validation for production readiness
 */
async function validateProductionReadiness() {
  console.log('\n🏭 Production Readiness Validation');
  console.log('=' .repeat(60));
  
  const validationCriteria = {
    throughputTarget: 833, // transactions per minute (50k/hour)
    responseTimeTarget: 200, // ms P95
    reliabilityTarget: 99, // % success rate
    performanceImprovement: 50 // % minimum improvement
  };
  
  console.log('\n📋 Validation Criteria:');
  console.log(`   Throughput: ≥${validationCriteria.throughputTarget} tx/min`);
  console.log(`   Response Time: ≤${validationCriteria.responseTimeTarget}ms (P95)`);
  console.log(`   Reliability: ≥${validationCriteria.reliabilityTarget}%`);
  console.log(`   Improvement: ≥${validationCriteria.performanceImprovement}%`);
  
  // Run validation benchmark
  const validationReport = await runSpecificScenario('Production Validation', {
    datasetSizes: [1000, 5000, 10000], // Production-like sizes
    benchmarkRuns: 15 // More runs for accuracy
  });
  
  if (!validationReport) {
    console.log('❌ Production validation failed - benchmark execution error');
    return false;
  }
  
  // Check each criterion
  const results = [];
  let allPassed = true;
  
  for (const [datasetSize, data] of Object.entries(validationReport.detailedResults)) {
    const optimized = data.optimized;
    const comparison = data.comparison;
    
    const throughputPassed = optimized.throughputPerMinute >= validationCriteria.throughputTarget;
    const responseTimePassed = optimized.p95Time <= validationCriteria.responseTimeTarget;
    const reliabilityPassed = parseFloat(optimized.successRate) >= validationCriteria.reliabilityTarget;
    const improvementPassed = comparison.performanceImprovement >= validationCriteria.performanceImprovement;
    
    const datasetPassed = throughputPassed && responseTimePassed && reliabilityPassed && improvementPassed;
    
    results.push({
      datasetSize,
      throughputPassed,
      responseTimePassed,
      reliabilityPassed,
      improvementPassed,
      datasetPassed
    });
    
    if (!datasetPassed) allPassed = false;
  }
  
  // Display validation results
  console.log('\n📊 Validation Results:');
  console.log('─'.repeat(90));
  console.log('| Dataset | Throughput | Response Time | Reliability | Improvement | Overall |');
  console.log('|---------|------------|---------------|-------------|-------------|---------|');
  
  results.forEach(result => {
    const throughputIcon = result.throughputPassed ? '✅' : '❌';
    const responseIcon = result.responseTimePassed ? '✅' : '❌';
    const reliabilityIcon = result.reliabilityPassed ? '✅' : '❌';
    const improvementIcon = result.improvementPassed ? '✅' : '❌';
    const overallIcon = result.datasetPassed ? '✅' : '❌';
    
    console.log(
      `| ${result.datasetSize.toString().padEnd(7)} | ` +
      `${throughputIcon.padEnd(10)} | ` +
      `${responseIcon.padEnd(13)} | ` +
      `${reliabilityIcon.padEnd(11)} | ` +
      `${improvementIcon.padEnd(11)} | ` +
      `${overallIcon.padEnd(7)} |`
    );
  });
  console.log('─'.repeat(90));
  
  // Final validation result
  if (allPassed) {
    console.log('\n🎉 Production Readiness: ✅ PASSED');
    console.log('   The optimized system meets all production criteria!');
    console.log('   Ready for deployment to production environment.');
  } else {
    console.log('\n⚠️  Production Readiness: ❌ FAILED');
    console.log('   Some criteria not met. Review optimization configuration.');
    console.log('   Consider additional tuning before production deployment.');
  }
  
  return allPassed;
}

// Execute benchmarks based on command line arguments
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'full';
  
  switch (command.toLowerCase()) {
    case 'full':
    case 'complete':
      await runPerformanceBenchmarks();
      break;
      
    case 'validate':
    case 'production':
      await validateProductionReadiness();
      break;
      
    case 'quick':
      await runSpecificScenario('Quick Test', {
        datasetSizes: [100, 1000],
        benchmarkRuns: 5
      });
      break;
      
    case 'stress':
      await runSpecificScenario('Stress Test', {
        datasetSizes: [5000, 10000, 25000],
        benchmarkRuns: 10
      });
      break;
      
    default:
      console.log('Usage: node runBenchmarks.js [command]');
      console.log('Commands:');
      console.log('  full      - Run complete benchmark suite (default)');
      console.log('  validate  - Run production readiness validation');
      console.log('  quick     - Run quick performance test');
      console.log('  stress    - Run stress test with large datasets');
      break;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Benchmark execution failed:', error);
    process.exit(1);
  });
}

export { runPerformanceBenchmarks, validateProductionReadiness };
EOF < /dev/null