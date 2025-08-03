import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { monitoringSystem } from '@/src/utils/monitoringSystem.js';
import { errorClassifier } from '@/src/utils/errorClassification.js';
import { retryCoordinator } from '@/src/utils/retryStrategies.js';
import { recoveryManager } from '@/src/utils/recoveryManager.js';

export const maxDuration = 30;

const HealthQuerySchema = z.object({
  workflowId: z.string().optional(),
  batchId: z.string().optional(),
  includeMetrics: z.string().transform(val => val === 'true').optional().default('true'),
  includeAlerts: z.string().transform(val => val === 'true').optional().default('true'),
  timeWindow: z.string().transform(val => parseInt(val)).optional().default('3600000') // 1 hour
});

/**
 * GET /api/cash-clearing/monitoring/health
 * Get comprehensive system health information
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const validatedParams = HealthQuerySchema.parse(params);

    // Get base system health
    const systemHealth = monitoringSystem.getSystemHealth();
    
    // Enhanced health data
    const healthData: any = {
      ...systemHealth,
      timestamp: Date.now(),
      version: '2.0.0',
      enhanced: true
    };

    // Add detailed metrics if requested
    if (validatedParams.includeMetrics) {
      healthData.detailedMetrics = {
        // @ts-ignore - monitoringSystem is a JS module with different type expectations
        workflowThroughput: monitoringSystem.getMetric('workflow_throughput', validatedParams.timeWindow),
        // @ts-ignore
        transactionThroughput: monitoringSystem.getMetric('transaction_throughput', validatedParams.timeWindow),
        // @ts-ignore
        errorRate: monitoringSystem.getMetric('error_rate', validatedParams.timeWindow),
        // @ts-ignore
        processingTime: monitoringSystem.getMetric('avg_processing_time', validatedParams.timeWindow),
        // @ts-ignore
        resourceUtilization: monitoringSystem.getMetric('resource_utilization', validatedParams.timeWindow),
        // @ts-ignore
        dataQualityScore: monitoringSystem.getMetric('data_quality_score', validatedParams.timeWindow)
      };

      // Error classification insights
      healthData.errorInsights = {
        trends: errorClassifier.getErrorTrends(validatedParams.timeWindow),
        // @ts-ignore - optional method that may not exist
        patterns: errorClassifier.getDetectedPatterns?.(validatedParams.timeWindow) || []
      };

      // Retry coordinator stats
      healthData.retryStats = retryCoordinator.getRetryMetrics();

      // Recovery manager stats
      healthData.recoveryStats = recoveryManager.getRecoveryMetrics();
    }

    // Add active alerts if requested
    if (validatedParams.includeAlerts) {
      healthData.activeAlerts = monitoringSystem.getActiveAlerts();
      healthData.alertHistory = monitoringSystem.getAlertHistory(validatedParams.timeWindow);
    }

    // Add workflow-specific health if IDs provided
    if (validatedParams.workflowId || validatedParams.batchId) {
      healthData.workflowHealth = await getWorkflowSpecificHealth(
        validatedParams.workflowId,
        validatedParams.batchId
      );
    }

    // Calculate derived health indicators
    healthData.healthScore = calculateOverallHealthScore(healthData);
    healthData.recommendations = generateHealthRecommendations(healthData);

    return NextResponse.json(healthData);

  } catch (error) {
    console.error('Health check failed:', error);
    
    return NextResponse.json({
      timestamp: Date.now(),
      overall: 'ERROR',
      error: 'Health check system failure',
      message: error instanceof Error ? error.message : 'Unknown error',
      healthScore: 0
    }, { status: 500 });
  }
}

/**
 * Get workflow-specific health information
 */
async function getWorkflowSpecificHealth(workflowId?: string, batchId?: string) {
  const workflowHealth: any = {
    workflowId,
    batchId,
    status: 'UNKNOWN',
    metrics: {},
    issues: []
  };

  try {
    // Get workflow status if IDs provided
    if (batchId) {
      // In a real implementation, this would query the database
      const workflowStatus = await getWorkflowStatus(workflowId, batchId);
      workflowHealth.status = workflowStatus?.workflow_status || 'UNKNOWN';
      workflowHealth.currentStep = workflowStatus?.current_step;
      workflowHealth.progress = calculateWorkflowProgress(workflowStatus);
    }

    // Get workflow-specific metrics
    workflowHealth.metrics = {
      processingTime: getWorkflowProcessingTime(workflowId, batchId),
      errorCount: getWorkflowErrorCount(workflowId, batchId),
      throughput: getWorkflowThroughput(workflowId, batchId)
    };

    // Check for workflow-specific issues
    workflowHealth.issues = await detectWorkflowIssues(workflowId, batchId);

  } catch (error) {
    workflowHealth.error = error instanceof Error ? error.message : 'Unknown error';
  }

  return workflowHealth;
}

/**
 * Calculate overall health score (0-100)
 */
function calculateOverallHealthScore(healthData: any): number {
  let score = 100;

  // Deduct points for active alerts
  const alertPenalties = {
    1: 25, // Critical
    2: 15, // High  
    3: 5,  // Medium
    4: 2,  // Low
    5: 0   // Info
  };

  if (healthData.alerts) {
    score -= (healthData.alerts.critical * alertPenalties[1]);
    score -= (healthData.alerts.high * alertPenalties[2]);
    score -= (healthData.alerts.medium * alertPenalties[3]);
    score -= (healthData.alerts.low * alertPenalties[4]);
  }

  // Deduct points for high error rate
  if (healthData.metrics?.error_rate && healthData.metrics.error_rate > 0.05) {
    score -= Math.min(30, healthData.metrics.error_rate * 500); // Cap at 30 points
  }

  // Deduct points for poor performance
  if (healthData.metrics?.avg_processing_time && healthData.metrics.avg_processing_time > 300000) {
    score -= Math.min(20, (healthData.metrics.avg_processing_time - 300000) / 10000);
  }

  // Deduct points for high resource utilization
  if (healthData.metrics?.resource_utilization && healthData.metrics.resource_utilization > 0.85) {
    score -= Math.min(15, (healthData.metrics.resource_utilization - 0.85) * 100);
  }

  // Bonus points for good recovery stats
  if (healthData.recoveryStats?.successfulRecoveries > 0) {
    const recoveryRate = healthData.recoveryStats.successfulRecoveries / 
                        healthData.recoveryStats.totalRecoveries;
    if (recoveryRate > 0.8) {
      score += 5; // Bonus for good recovery
    }
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Generate health recommendations based on current state
 */
function generateHealthRecommendations(healthData: any): string[] {
  const recommendations: string[] = [];

  // Critical alerts
  if (healthData.alerts?.critical > 0) {
    recommendations.push('URGENT: Address critical alerts immediately');
  }

  // High error rate
  if (healthData.metrics?.error_rate > 0.1) {
    recommendations.push('High error rate detected - investigate error patterns and implement fixes');
  }

  // Performance issues
  if (healthData.metrics?.avg_processing_time > 300000) {
    recommendations.push('Processing time exceeds SLA - consider batch size optimization or resource scaling');
  }

  // Resource utilization
  if (healthData.metrics?.resource_utilization > 0.9) {
    recommendations.push('Resource utilization critical - scale resources or reduce load');
  } else if (healthData.metrics?.resource_utilization > 0.8) {
    recommendations.push('Resource utilization high - monitor and prepare for scaling');
  }

  // Circuit breaker issues
  if (healthData.retryStats?.circuitBreakerState && 
      Object.values(healthData.retryStats.circuitBreakerState).some((state: any) => state === 'OPEN')) {
    recommendations.push('Circuit breakers are open - investigate underlying service issues');
  }

  // Dead letter queue buildup
  if (healthData.retryStats?.deadLetterQueueSize > 10) {
    recommendations.push('Dead letter queue has items - review and reprocess failed operations');
  }

  // Pattern detection insights
  if (healthData.errorInsights?.patterns?.length > 0) {
    recommendations.push('Error patterns detected - analyze patterns and implement preventive measures');
  }

  // Default healthy state
  if (recommendations.length === 0 && healthData.healthScore > 90) {
    recommendations.push('System is operating optimally');
  }

  return recommendations;
}

/**
 * Helper functions for workflow-specific data
 * In a real implementation, these would query the actual database
 */
async function getWorkflowStatus(workflowId?: string, batchId?: string) {
  // Placeholder implementation
  return {
    workflow_status: 'RUNNING',
    current_step: 2,
    total_transactions: 1000,
    processed_transactions: 750,
    failed_transactions: 25
  };
}

function calculateWorkflowProgress(workflowStatus: any): number {
  if (!workflowStatus) return 0;
  
  const { total_transactions, processed_transactions, failed_transactions } = workflowStatus;
  if (!total_transactions) return 0;
  
  return Math.round(((processed_transactions + failed_transactions) / total_transactions) * 100);
}

function getWorkflowProcessingTime(workflowId?: string, batchId?: string): number {
  // Placeholder implementation
  return Math.random() * 300000; // Random processing time
}

function getWorkflowErrorCount(workflowId?: string, batchId?: string): number {
  // Placeholder implementation
  return Math.floor(Math.random() * 10);
}

function getWorkflowThroughput(workflowId?: string, batchId?: string): number {
  // Placeholder implementation
  return Math.random() * 100; // Random throughput
}

async function detectWorkflowIssues(workflowId?: string, batchId?: string): Promise<string[]> {
  // Placeholder implementation
  const issues: string[] = [];
  
  if (Math.random() > 0.8) {
    issues.push('Batch processing slower than expected');
  }
  
  if (Math.random() > 0.9) {
    issues.push('High error rate in current batch');
  }
  
  return issues;
}