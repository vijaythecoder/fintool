import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCashClearingMcpClient } from '@/src/services/cashClearingMcpClient.js';
import { logger } from '@/src/utils/logger.js';
import { getUserIdOrFallback, type AuthResult, type User } from '@/lib/api-middleware';
export const maxDuration = 30;

// Response schema
const WorkflowStatusResponseSchema = z.object({
  success: z.boolean(),
  workflowId: z.string().optional(),
  batchId: z.string(),
  status: z.enum(['RUNNING', 'COMPLETED', 'FAILED', 'PAUSED']),
  currentStep: z.number().min(1).max(4),
  progress: z.object({
    totalTransactions: z.number(),
    processedTransactions: z.number(),
    failedTransactions: z.number(),
    percentComplete: z.number(),
    estimatedTimeRemaining: z.string().optional()
  }),
  stepDetails: z.object({
    step1: z.object({
      name: z.string(),
      status: z.enum(['pending', 'running', 'completed', 'failed']),
      completedAt: z.string().optional(),
      transactionCount: z.number().optional(),
      processingTimeMs: z.number().optional()
    }),
    step2: z.object({
      name: z.string(),
      status: z.enum(['pending', 'running', 'completed', 'failed']),
      completedAt: z.string().optional(),
      transactionCount: z.number().optional(),
      processingTimeMs: z.number().optional()
    }),
    step3: z.object({
      name: z.string(),
      status: z.enum(['pending', 'running', 'completed', 'failed']),
      completedAt: z.string().optional(),
      pendingApprovals: z.number().optional(),
      requiresHumanReview: z.boolean().optional()
    }),
    step4: z.object({
      name: z.string(),
      status: z.enum(['pending', 'running', 'completed', 'failed']),
      completedAt: z.string().optional(),
      suggestionsCreated: z.number().optional(),
      processingTimeMs: z.number().optional()
    })
  }),
  approvals: z.object({
    pending: z.number(),
    approved: z.number(),
    rejected: z.number(),
    autoApproved: z.number()
  }),
  metrics: z.object({
    averageConfidence: z.number(),
    processingRate: z.number(),
    totalAmount: z.number(),
    processedAmount: z.number()
  }),
  errors: z.array(z.object({
    step: z.number(),
    error: z.string(),
    transactionId: z.string().optional(),
    timestamp: z.string()
  })).optional(),
  lastUpdated: z.string(),
  createdAt: z.string(),
  estimatedCompletion: z.string().optional()
});

type WorkflowStatusResponse = z.infer<typeof WorkflowStatusResponseSchema>;

/**
 * GET /api/cash-clearing/workflow/[batchId]/status
 * Get workflow status and progress
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { batchId: string } }
) {
  const startTime = Date.now();

  try {
    const { batchId } = params;

    if (!batchId) {
      return NextResponse.json(
        { error: 'Missing batchId parameter' },
        { status: 400 }
      );
    }

    // Authentication check
    const authResult = await authenticateRequest(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    logger.debug('Fetching workflow status', { batchId, userId: getUserIdOrFallback(authResult) });

    // Get MCP client and fetch workflow status
    const mcpClient = getCashClearingMcpClient();
    const workflowStatus = await mcpClient.getWorkflowStatus(batchId);

    if (!workflowStatus) {
      return NextResponse.json(
        {
          error: 'Workflow not found',
          message: `No workflow found with batchId: ${batchId}`
        },
        { status: 404 }
      );
    }

    // Get additional metrics
    const [pendingApprovals, metrics] = await Promise.all([
      mcpClient.getPendingApprovals(batchId),
      calculateWorkflowMetrics(mcpClient, batchId)
    ]);

    // Calculate progress
    const percentComplete = workflowStatus.total_transactions > 0
      ? (workflowStatus.processed_transactions / workflowStatus.total_transactions) * 100
      : 0;

    // Estimate time remaining
    const estimatedTimeRemaining = calculateEstimatedTimeRemaining(
      workflowStatus,
      percentComplete
    );

    // Build step details
    const stepDetails = buildStepDetails(workflowStatus, pendingApprovals.length);

    // Parse error details if they exist
    const errors = workflowStatus.error_details 
      ? parseErrorDetails(workflowStatus.error_details)
      : [];

    const response: WorkflowStatusResponse = {
      success: true,
      workflowId: workflowStatus.workflow_id,
      batchId: workflowStatus.batch_id,
      status: workflowStatus.workflow_status,
      currentStep: workflowStatus.current_step,
      progress: {
        totalTransactions: workflowStatus.total_transactions,
        processedTransactions: workflowStatus.processed_transactions,
        failedTransactions: workflowStatus.failed_transactions,
        percentComplete: Math.round(percentComplete * 100) / 100,
        estimatedTimeRemaining
      },
      stepDetails,
      approvals: {
        pending: workflowStatus.pending_approvals || 0,
        approved: workflowStatus.approved_suggestions || 0,
        rejected: workflowStatus.rejected_suggestions || 0,
        autoApproved: metrics.autoApproved
      },
      metrics: {
        averageConfidence: metrics.averageConfidence,
        processingRate: percentComplete / 100,
        totalAmount: metrics.totalAmount,
        processedAmount: metrics.processedAmount
      },
      errors: errors.length > 0 ? errors : undefined,
      lastUpdated: workflowStatus.updated_at || workflowStatus.created_at,
      createdAt: workflowStatus.created_at,
      estimatedCompletion: calculateEstimatedCompletion(workflowStatus, estimatedTimeRemaining)
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Processing-Time': `${Date.now() - startTime}ms`
      }
    });

  } catch (error) {
    logger.error('Failed to get workflow status', {
      error: error instanceof Error ? error.message : 'Unknown error',
      batchId: params.batchId,
      processingTimeMs: Date.now() - startTime
    });

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to fetch workflow status'
      },
      { status: 500 }
    );
  }
}

/**
 * Helper functions
 */
async function authenticateRequest(request: NextRequest): Promise<AuthResult> {
  // Reuse authentication logic from start route
  const authHeader = request.headers.get('authorization');
  const apiKey = request.headers.get('x-api-key');

  if (apiKey && process.env.CASH_CLEARING_API_KEY === apiKey) {
    return {
      success: true,
      user: { id: 'api-user', type: 'api' as const, permissions: [] }
    };
  }

  if (authHeader?.startsWith('Bearer ')) {
    // JWT validation placeholder
    return {
      success: true,
      user: { id: 'user-123', type: 'user' as const, permissions: [] }
    };
  }

  return { success: false };
}

async function calculateWorkflowMetrics(mcpClient: any, batchId: string) {
  try {
    // This would fetch actual metrics from BigQuery
    // For now, return mock data structure
    return {
      autoApproved: 0,
      averageConfidence: 0.85,
      totalAmount: 0,
      processedAmount: 0
    };
  } catch (error) {
    logger.warn('Failed to calculate workflow metrics', { batchId, error: error instanceof Error ? error.message : 'Unknown error' });
    return {
      autoApproved: 0,
      averageConfidence: 0,
      totalAmount: 0,
      processedAmount: 0
    };
  }
}

function buildStepDetails(workflowStatus: any, pendingApprovalsCount: number) {
  const currentStep = workflowStatus.current_step;
  const status = workflowStatus.workflow_status;

  return {
    step1: {
      name: 'Query Cash Transactions',
      status: getStepStatus(1, currentStep, status, workflowStatus.step_1_completed_at),
      completedAt: workflowStatus.step_1_completed_at,
      transactionCount: workflowStatus.total_transactions,
      processingTimeMs: undefined // Would be stored in audit log
    },
    step2: {
      name: 'Pattern Matching',
      status: getStepStatus(2, currentStep, status, workflowStatus.step_2_completed_at),
      completedAt: workflowStatus.step_2_completed_at,
      transactionCount: workflowStatus.processed_transactions,
      processingTimeMs: undefined
    },
    step3: {
      name: 'Human Approval Review',
      status: getStepStatus(3, currentStep, status, workflowStatus.step_3_completed_at),
      completedAt: workflowStatus.step_3_completed_at,
      pendingApprovals: pendingApprovalsCount,
      requiresHumanReview: workflowStatus.human_approval_required
    },
    step4: {
      name: 'Generate Suggestions',
      status: getStepStatus(4, currentStep, status, workflowStatus.step_4_completed_at),
      completedAt: workflowStatus.step_4_completed_at,
      suggestionsCreated: workflowStatus.processed_transactions,
      processingTimeMs: undefined
    }
  };
}

function getStepStatus(
  stepNumber: number,
  currentStep: number,
  workflowStatus: string,
  completedAt?: string
): 'pending' | 'running' | 'completed' | 'failed' {
  if (workflowStatus === 'FAILED') return 'failed';
  if (completedAt) return 'completed';
  if (stepNumber === currentStep && workflowStatus === 'RUNNING') return 'running';
  if (stepNumber < currentStep) return 'completed';
  return 'pending';
}

function calculateEstimatedTimeRemaining(
  workflowStatus: any,
  percentComplete: number
): string | undefined {
  if (workflowStatus.workflow_status === 'COMPLETED' || workflowStatus.workflow_status === 'FAILED') {
    return undefined;
  }

  if (percentComplete === 0) return undefined;

  const elapsedTime = Date.now() - new Date(workflowStatus.created_at).getTime();
  const totalEstimatedTime = elapsedTime / (percentComplete / 100);
  const remainingTime = totalEstimatedTime - elapsedTime;

  if (remainingTime <= 0) return 'Almost complete';

  return formatDuration(remainingTime);
}

function calculateEstimatedCompletion(
  workflowStatus: any,
  estimatedTimeRemaining?: string
): string | undefined {
  if (!estimatedTimeRemaining || 
      workflowStatus.workflow_status === 'COMPLETED' || 
      workflowStatus.workflow_status === 'FAILED') {
    return undefined;
  }

  // Parse the remaining time and add to current time
  const remainingMs = parseDurationToMs(estimatedTimeRemaining);
  if (remainingMs > 0) {
    const completionTime = new Date(Date.now() + remainingMs);
    return completionTime.toISOString();
  }

  return undefined;
}

function parseErrorDetails(errorDetails: any): Array<{
  step: number;
  error: string;
  transactionId?: string;
  timestamp: string;
}> {
  try {
    if (typeof errorDetails === 'string') {
      const parsed = JSON.parse(errorDetails);
      return Array.isArray(parsed) ? parsed : [parsed];
    }
    if (Array.isArray(errorDetails)) {
      return errorDetails;
    }
    return [errorDetails];
  } catch {
    return [];
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function parseDurationToMs(duration: string): number {
  const timePattern = /(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s)?/;
  const match = duration.match(timePattern);
  
  if (!match) return 0;
  
  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  const seconds = parseInt(match[3] || '0');
  
  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}