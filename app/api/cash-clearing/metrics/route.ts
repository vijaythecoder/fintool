import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCashClearingMcpClient } from '@/src/services/cashClearingMcpClient.js';
import { logger } from '@/src/utils/logger.js';
import { getUserIdOrFallback, type AuthResult, type User } from '@/lib/api-middleware';
export const maxDuration = 30;

// Query parameters schema
const MetricsQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  granularity: z.enum(['hour', 'day', 'week', 'month']).optional().default('day'),
  metricTypes: z.array(z.enum([
    'workflow_performance',
    'approval_rates',
    'processing_times',
    'confidence_scores',
    'error_rates',
    'throughput',
    'pattern_effectiveness',
    'gl_mapping_accuracy'
  ])).optional().default(['workflow_performance', 'approval_rates']),
  includeComparison: z.coerce.boolean().optional().default(false),
  aggregationLevel: z.enum(['summary', 'detailed', 'raw']).optional().default('summary')
});

// Response schema
const MetricsResponseSchema = z.object({
  success: z.boolean(),
  timeRange: z.object({
    startDate: z.string(),
    endDate: z.string(),
    granularity: z.string()
  }),
  summary: z.object({
    totalTransactions: z.number(),
    totalWorkflows: z.number(),
    averageProcessingTime: z.number(),
    overallSuccessRate: z.number(),
    averageConfidence: z.number(),
    totalAmount: z.number(),
    approvalRate: z.number(),
    autoApprovalRate: z.number()
  }),
  metrics: z.object({
    workflow_performance: z.array(z.object({
      date: z.string(),
      workflows_started: z.number(),
      workflows_completed: z.number(),
      workflows_failed: z.number(),
      average_completion_time: z.number(),
      success_rate: z.number()
    })).optional(),
    approval_rates: z.array(z.object({
      date: z.string(),
      total_suggestions: z.number(),
      approved: z.number(),
      rejected: z.number(),
      auto_approved: z.number(),
      pending: z.number(),
      approval_rate: z.number(),
      auto_approval_rate: z.number()
    })).optional(),
    processing_times: z.array(z.object({
      date: z.string(),
      step1_avg_time: z.number(),
      step2_avg_time: z.number(),
      step3_avg_time: z.number(),
      step4_avg_time: z.number(),
      total_avg_time: z.number()
    })).optional(),
    confidence_scores: z.array(z.object({
      date: z.string(),
      average_confidence: z.number(),
      confidence_distribution: z.object({
        low: z.number(),
        medium: z.number(),
        high: z.number()
      })
    })).optional(),
    error_rates: z.array(z.object({
      date: z.string(),
      total_errors: z.number(),
      error_rate: z.number(),
      error_categories: z.record(z.number())
    })).optional(),
    throughput: z.array(z.object({
      date: z.string(),
      transactions_per_hour: z.number(),
      peak_hour_throughput: z.number(),
      average_batch_size: z.number()
    })).optional(),
    pattern_effectiveness: z.array(z.object({
      pattern_name: z.string(),
      usage_count: z.number(),
      success_rate: z.number(),
      average_confidence: z.number(),
      last_used: z.string()
    })).optional(),
    gl_mapping_accuracy: z.array(z.object({
      gl_account_code: z.string(),
      gl_account_name: z.string(),
      total_mappings: z.number(),
      approved_mappings: z.number(),
      accuracy_rate: z.number(),
      average_confidence: z.number()
    })).optional()
  }),
  comparison: z.object({
    previous_period: z.record(z.any()),
    change_percentage: z.record(z.number()),
    trends: z.array(z.object({
      metric: z.string(),
      trend: z.enum(['improving', 'declining', 'stable']),
      change_rate: z.number()
    }))
  }).optional(),
  insights: z.array(z.object({
    type: z.enum(['performance', 'quality', 'efficiency', 'risk']),
    title: z.string(),
    description: z.string(),
    severity: z.enum(['info', 'warning', 'critical']),
    actionable: z.boolean(),
    recommendation: z.string().optional()
  }))
});

type MetricsQuery = z.infer<typeof MetricsQuerySchema>;
type MetricsResponse = z.infer<typeof MetricsResponseSchema>;

/**
 * GET /api/cash-clearing/metrics
 * Get processing metrics and analytics
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Parse and validate query parameters
    const { searchParams } = new URL(request.url);
    const queryParams: any = Object.fromEntries(searchParams.entries());
    
    // Handle array parameter for metricTypes
    if (queryParams.metricTypes && typeof queryParams.metricTypes === 'string') {
      queryParams.metricTypes = queryParams.metricTypes.split(',');
    }

    const validatedQuery = MetricsQuerySchema.parse(queryParams);

    // Authentication check
    const authResult = await authenticateRequest(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Authorization check
    if (!hasMetricsPermission(authResult.user)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Insufficient permissions to access metrics' },
        { status: 403 }
      );
    }

    // Set default date range if not provided
    const endDate = validatedQuery.endDate || new Date().toISOString().split('T')[0];
    const startDate = validatedQuery.startDate || 
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    logger.debug('Fetching metrics', {
      userId: getUserIdOrFallback(authResult),
      dateRange: { startDate, endDate },
      metricTypes: validatedQuery.metricTypes,
      granularity: validatedQuery.granularity
    });

    // Get MCP client
    const mcpClient = getCashClearingMcpClient();

    // Fetch summary data
    const summary = await fetchSummaryMetrics(mcpClient, startDate, endDate);

    // Fetch detailed metrics based on requested types
    const metrics: any = {};
    for (const metricType of validatedQuery.metricTypes) {
      switch (metricType) {
        case 'workflow_performance':
          metrics.workflow_performance = await fetchWorkflowPerformanceMetrics(
            mcpClient, startDate, endDate, validatedQuery.granularity
          );
          break;
        case 'approval_rates':
          metrics.approval_rates = await fetchApprovalRateMetrics(
            mcpClient, startDate, endDate, validatedQuery.granularity
          );
          break;
        case 'processing_times':
          metrics.processing_times = await fetchProcessingTimeMetrics(
            mcpClient, startDate, endDate, validatedQuery.granularity
          );
          break;
        case 'confidence_scores':
          metrics.confidence_scores = await fetchConfidenceScoreMetrics(
            mcpClient, startDate, endDate, validatedQuery.granularity
          );
          break;
        case 'error_rates':
          metrics.error_rates = await fetchErrorRateMetrics(
            mcpClient, startDate, endDate, validatedQuery.granularity
          );
          break;
        case 'throughput':
          metrics.throughput = await fetchThroughputMetrics(
            mcpClient, startDate, endDate, validatedQuery.granularity
          );
          break;
        case 'pattern_effectiveness':
          metrics.pattern_effectiveness = await fetchPatternEffectivenessMetrics(
            mcpClient, startDate, endDate
          );
          break;
        case 'gl_mapping_accuracy':
          metrics.gl_mapping_accuracy = await fetchGLMappingAccuracyMetrics(
            mcpClient, startDate, endDate
          );
          break;
      }
    }

    // Fetch comparison data if requested
    let comparison;
    if (validatedQuery.includeComparison) {
      comparison = await fetchComparisonMetrics(
        mcpClient, startDate, endDate, validatedQuery.metricTypes
      );
    }

    // Generate insights
    const insights = generateInsights(summary, metrics);

    const response: MetricsResponse = {
      success: true,
      timeRange: {
        startDate,
        endDate,
        granularity: validatedQuery.granularity
      },
      summary,
      metrics,
      comparison,
      insights
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'private, max-age=300', // Cache for 5 minutes
        'X-Processing-Time': `${Date.now() - startTime}ms`
      }
    });

  } catch (error) {
    logger.error('Failed to fetch metrics', {
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTimeMs: Date.now() - startTime
    });

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          message: 'Invalid query parameters',
          details: error.errors
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to fetch metrics'
      },
      { status: 500 }
    );
  }
}

/**
 * Helper functions
 */
async function authenticateRequest(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization');
  const apiKey = request.headers.get('x-api-key');

  if (apiKey && process.env.CASH_CLEARING_API_KEY === apiKey) {
    return {
      success: true,
      user: { id: 'api-user', type: 'api' as const, permissions: ['metrics:read'] }
    };
  }

  if (authHeader?.startsWith('Bearer ')) {
    return {
      success: true,
      user: { id: 'user-123', type: 'user' as const, permissions: ['metrics:read'] }
    };
  }

  return { success: false };
}

function hasMetricsPermission(user: any): boolean {
  return user.permissions?.includes('metrics:read') || user.type === 'api';
}

async function fetchSummaryMetrics(mcpClient: any, startDate: string, endDate: string) {
  const dataset = 'ksingamsetty-test.AI_POC';

  const query = `
    WITH workflow_stats AS (
      SELECT 
        COUNT(*) as total_workflows,
        COUNT(CASE WHEN workflow_status = 'COMPLETED' THEN 1 END) as completed_workflows,
        AVG(TIMESTAMP_DIFF(step_4_completed_at, created_at, SECOND)) as avg_completion_time
      FROM ${dataset}.cash_clearing_workflow_state
      WHERE DATE(created_at) BETWEEN '${startDate}' AND '${endDate}'
    ),
    suggestion_stats AS (
      SELECT 
        COUNT(*) as total_suggestions,
        COUNT(CASE WHEN approval_status = 'APPROVED' THEN 1 END) as approved,
        COUNT(CASE WHEN approval_status = 'AUTO_APPROVED' THEN 1 END) as auto_approved,
        AVG(confidence_score) as avg_confidence,
        SUM(amount) as total_amount
      FROM ${dataset}.ai_cash_clearing_suggestions
      WHERE DATE(created_at) BETWEEN '${startDate}' AND '${endDate}'
    ),
    transaction_stats AS (
      SELECT COUNT(*) as total_transactions
      FROM ${dataset}.cash_transactions
      WHERE DATE(created_at) BETWEEN '${startDate}' AND '${endDate}'
    )
    SELECT 
      COALESCE(t.total_transactions, 0) as totalTransactions,
      COALESCE(w.total_workflows, 0) as totalWorkflows,
      COALESCE(w.avg_completion_time, 0) as averageProcessingTime,
      CASE WHEN w.total_workflows > 0 THEN w.completed_workflows / w.total_workflows ELSE 0 END as overallSuccessRate,
      COALESCE(s.avg_confidence, 0) as averageConfidence,
      COALESCE(s.total_amount, 0) as totalAmount,
      CASE WHEN s.total_suggestions > 0 THEN (s.approved + s.auto_approved) / s.total_suggestions ELSE 0 END as approvalRate,
      CASE WHEN s.total_suggestions > 0 THEN s.auto_approved / s.total_suggestions ELSE 0 END as autoApprovalRate
    FROM workflow_stats w
    CROSS JOIN suggestion_stats s
    CROSS JOIN transaction_stats t
  `;

  const results = await mcpClient.executeQueryWithRetry(query);
  return results[0] || {
    totalTransactions: 0,
    totalWorkflows: 0,
    averageProcessingTime: 0,
    overallSuccessRate: 0,
    averageConfidence: 0,
    totalAmount: 0,
    approvalRate: 0,
    autoApprovalRate: 0
  };
}

async function fetchWorkflowPerformanceMetrics(
  mcpClient: any,
  startDate: string,
  endDate: string,
  granularity: string
) {
  const dataset = 'ksingamsetty-test.AI_POC';
  
  const dateFormat = getDateFormat(granularity);
  
  const query = `
    SELECT 
      ${dateFormat} as date,
      COUNT(*) as workflows_started,
      COUNT(CASE WHEN workflow_status = 'COMPLETED' THEN 1 END) as workflows_completed,
      COUNT(CASE WHEN workflow_status = 'FAILED' THEN 1 END) as workflows_failed,
      AVG(CASE WHEN step_4_completed_at IS NOT NULL 
          THEN TIMESTAMP_DIFF(step_4_completed_at, created_at, SECOND) END) as average_completion_time,
      CASE WHEN COUNT(*) > 0 
           THEN COUNT(CASE WHEN workflow_status = 'COMPLETED' THEN 1 END) / COUNT(*) 
           ELSE 0 END as success_rate
    FROM ${dataset}.cash_clearing_workflow_state
    WHERE DATE(created_at) BETWEEN '${startDate}' AND '${endDate}'
    GROUP BY date
    ORDER BY date
  `;

  return await mcpClient.executeQueryWithRetry(query);
}

async function fetchApprovalRateMetrics(
  mcpClient: any,
  startDate: string,
  endDate: string,
  granularity: string
) {
  const dataset = 'ksingamsetty-test.AI_POC';
  const dateFormat = getDateFormat(granularity);
  
  const query = `
    SELECT 
      ${dateFormat} as date,
      COUNT(*) as total_suggestions,
      COUNT(CASE WHEN approval_status = 'APPROVED' THEN 1 END) as approved,
      COUNT(CASE WHEN approval_status = 'REJECTED' THEN 1 END) as rejected,
      COUNT(CASE WHEN approval_status = 'AUTO_APPROVED' THEN 1 END) as auto_approved,
      COUNT(CASE WHEN approval_status = 'PENDING' THEN 1 END) as pending,
      CASE WHEN COUNT(*) > 0 
           THEN (COUNT(CASE WHEN approval_status = 'APPROVED' THEN 1 END) + 
                 COUNT(CASE WHEN approval_status = 'AUTO_APPROVED' THEN 1 END)) / COUNT(*) 
           ELSE 0 END as approval_rate,
      CASE WHEN COUNT(*) > 0 
           THEN COUNT(CASE WHEN approval_status = 'AUTO_APPROVED' THEN 1 END) / COUNT(*) 
           ELSE 0 END as auto_approval_rate
    FROM ${dataset}.ai_cash_clearing_suggestions
    WHERE DATE(created_at) BETWEEN '${startDate}' AND '${endDate}'
    GROUP BY date
    ORDER BY date
  `;

  return await mcpClient.executeQueryWithRetry(query);
}

async function fetchProcessingTimeMetrics(
  mcpClient: any,
  startDate: string,
  endDate: string,
  granularity: string
) {
  const dataset = 'ksingamsetty-test.AI_POC';
  const dateFormat = getDateFormat(granularity);
  
  const query = `
    SELECT 
      ${dateFormat} as date,
      AVG(TIMESTAMP_DIFF(step_1_completed_at, created_at, SECOND)) as step1_avg_time,
      AVG(TIMESTAMP_DIFF(step_2_completed_at, step_1_completed_at, SECOND)) as step2_avg_time,
      AVG(TIMESTAMP_DIFF(step_3_completed_at, step_2_completed_at, SECOND)) as step3_avg_time,
      AVG(TIMESTAMP_DIFF(step_4_completed_at, step_3_completed_at, SECOND)) as step4_avg_time,
      AVG(TIMESTAMP_DIFF(step_4_completed_at, created_at, SECOND)) as total_avg_time
    FROM ${dataset}.cash_clearing_workflow_state
    WHERE DATE(created_at) BETWEEN '${startDate}' AND '${endDate}'
      AND workflow_status = 'COMPLETED'
    GROUP BY date
    ORDER BY date
  `;

  return await mcpClient.executeQueryWithRetry(query);
}

async function fetchConfidenceScoreMetrics(
  mcpClient: any,
  startDate: string,
  endDate: string,
  granularity: string
) {
  const dataset = 'ksingamsetty-test.AI_POC';
  const dateFormat = getDateFormat(granularity);
  
  const query = `
    SELECT 
      ${dateFormat} as date,
      AVG(confidence_score) as average_confidence,
      COUNT(CASE WHEN confidence_score < 0.5 THEN 1 END) as low,
      COUNT(CASE WHEN confidence_score >= 0.5 AND confidence_score < 0.8 THEN 1 END) as medium,
      COUNT(CASE WHEN confidence_score >= 0.8 THEN 1 END) as high
    FROM ${dataset}.ai_cash_clearing_suggestions
    WHERE DATE(created_at) BETWEEN '${startDate}' AND '${endDate}'
    GROUP BY date
    ORDER BY date
  `;

  const results = await mcpClient.executeQueryWithRetry(query);
  
  return results.map((row: any) => ({
    ...row,
    confidence_distribution: {
      low: row.low,
      medium: row.medium,
      high: row.high
    }
  }));
}

async function fetchErrorRateMetrics(
  mcpClient: any,
  startDate: string,
  endDate: string,
  granularity: string
) {
  // This would require an error log table - placeholder implementation
  return [];
}

async function fetchThroughputMetrics(
  mcpClient: any,
  startDate: string,
  endDate: string,
  granularity: string
) {
  // Placeholder implementation for throughput metrics
  return [];
}

async function fetchPatternEffectivenessMetrics(
  mcpClient: any,
  startDate: string,
  endDate: string
) {
  const dataset = 'ksingamsetty-test.AI_POC';
  
  const query = `
    SELECT 
      s.pattern_matched as pattern_name,
      COUNT(*) as usage_count,
      COUNT(CASE WHEN s.approval_status IN ('APPROVED', 'AUTO_APPROVED') THEN 1 END) / COUNT(*) as success_rate,
      AVG(s.confidence_score) as average_confidence,
      MAX(s.created_at) as last_used
    FROM ${dataset}.ai_cash_clearing_suggestions s
    WHERE DATE(s.created_at) BETWEEN '${startDate}' AND '${endDate}'
      AND s.pattern_matched IS NOT NULL
    GROUP BY s.pattern_matched
    ORDER BY usage_count DESC
  `;

  return await mcpClient.executeQueryWithRetry(query);
}

async function fetchGLMappingAccuracyMetrics(
  mcpClient: any,
  startDate: string,
  endDate: string
) {
  const dataset = 'ksingamsetty-test.AI_POC';
  
  const query = `
    SELECT 
      s.gl_account_code,
      s.gl_account_name,
      COUNT(*) as total_mappings,
      COUNT(CASE WHEN s.approval_status IN ('APPROVED', 'AUTO_APPROVED') THEN 1 END) as approved_mappings,
      COUNT(CASE WHEN s.approval_status IN ('APPROVED', 'AUTO_APPROVED') THEN 1 END) / COUNT(*) as accuracy_rate,
      AVG(s.confidence_score) as average_confidence
    FROM ${dataset}.ai_cash_clearing_suggestions s
    WHERE DATE(s.created_at) BETWEEN '${startDate}' AND '${endDate}'
      AND s.gl_account_code IS NOT NULL
    GROUP BY s.gl_account_code, s.gl_account_name
    ORDER BY total_mappings DESC
  `;

  return await mcpClient.executeQueryWithRetry(query);
}

async function fetchComparisonMetrics(
  mcpClient: any,
  startDate: string,
  endDate: string,
  metricTypes: string[]
) {
  // Calculate previous period dates
  const currentStart = new Date(startDate);
  const currentEnd = new Date(endDate);
  const periodLength = currentEnd.getTime() - currentStart.getTime();
  
  const previousStart = new Date(currentStart.getTime() - periodLength);
  const previousEnd = new Date(currentEnd.getTime() - periodLength);
  
  // Fetch previous period metrics (simplified)
  const previousSummary = await fetchSummaryMetrics(
    mcpClient,
    previousStart.toISOString().split('T')[0],
    previousEnd.toISOString().split('T')[0]
  );

  return {
    previous_period: previousSummary,
    change_percentage: {},
    trends: []
  };
}

function generateInsights(summary: any, metrics: any) {
  const insights: any[] = [];

  // Performance insights
  if (summary.overallSuccessRate < 0.8) {
    insights.push({
      type: 'performance',
      title: 'Low Success Rate Detected',
      description: `Overall success rate is ${(summary.overallSuccessRate * 100).toFixed(1)}%, below the 80% threshold`,
      severity: 'warning',
      actionable: true,
      recommendation: 'Review failed workflows and improve pattern matching accuracy'
    });
  }

  // Confidence insights
  if (summary.averageConfidence < 0.7) {
    insights.push({
      type: 'quality',
      title: 'Low Confidence Scores',
      description: `Average confidence score is ${(summary.averageConfidence * 100).toFixed(1)}%`,
      severity: 'warning',
      actionable: true,
      recommendation: 'Review and enhance pattern matching rules'
    });
  }

  // Approval rate insights
  if (summary.autoApprovalRate < 0.5) {
    insights.push({
      type: 'efficiency',
      title: 'Low Auto-Approval Rate',
      description: `Only ${(summary.autoApprovalRate * 100).toFixed(1)}% of suggestions are auto-approved`,
      severity: 'info',
      actionable: true,
      recommendation: 'Consider adjusting confidence thresholds for auto-approval'
    });
  }

  return insights;
}

function getDateFormat(granularity: string): string {
  switch (granularity) {
    case 'hour':
      return 'FORMAT_TIMESTAMP("%Y-%m-%d %H:00:00", created_at)';
    case 'day':
      return 'DATE(created_at)';
    case 'week':
      return 'DATE_TRUNC(DATE(created_at), WEEK)';
    case 'month':
      return 'DATE_TRUNC(DATE(created_at), MONTH)';
    default:
      return 'DATE(created_at)';
  }
}