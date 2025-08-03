import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { CashClearingProcessor } from '@/src/processors/cashClearingProcessor.js';
import { getCashClearingMcpClient } from '@/src/services/cashClearingMcpClient.js';
import { logger } from '@/src/utils/logger.js';
import { getUserIdOrFallback, type AuthResult, type User } from '@/lib/api-middleware';
import { headers } from 'next/headers';
import { rateLimit } from '@/lib/rate-limit';

export const maxDuration = 60; // 60 seconds for workflow start

// Request validation schema
const StartWorkflowSchema = z.object({
  batchSize: z.number().min(1).max(1000).optional().default(100),
  requireHumanApproval: z.boolean().optional().default(true),
  approvalThreshold: z.number().min(0).max(1).optional().default(0.9),
  maxConcurrentSteps: z.number().min(1).max(5).optional().default(1),
  enableAuditLog: z.boolean().optional().default(true),
  metadata: z.record(z.any()).optional(),
  filters: z.object({
    dateRange: z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional()
    }).optional(),
    amountRange: z.object({
      minAmount: z.number().optional(),
      maxAmount: z.number().optional()
    }).optional(),
    accountPattern: z.string().optional()
  }).optional()
});

// Response schema
const WorkflowStartResponseSchema = z.object({
  success: z.boolean(),
  workflowId: z.string(),
  batchId: z.string(),
  estimatedTransactions: z.number(),
  estimatedProcessingTime: z.string(),
  status: z.enum(['INITIATED', 'RUNNING']),
  statusUrl: z.string(),
  message: z.string()
});

type StartWorkflowRequest = z.infer<typeof StartWorkflowSchema>;
type WorkflowStartResponse = z.infer<typeof WorkflowStartResponseSchema>;

/**
 * POST /api/cash-clearing/workflow/start
 * Start a new cash clearing workflow
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let batchId: string | null = null;

  try {
    // Rate limiting check
    const identifier = getClientIdentifier(request);
    const rateLimitResult = await rateLimit.check(identifier, 'workflow-start', {
      limit: 5, // 5 workflow starts per hour
      window: '1h'
    });

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          retryAfter: rateLimitResult.retryAfter
        },
        { 
          status: 429,
          headers: {
            'Retry-After': rateLimitResult.retryAfter?.toString() || '3600'
          }
        }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = StartWorkflowSchema.parse(body);

    // Authentication check
    const authResult = await authenticateRequest(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Valid authentication required' },
        { status: 401 }
      );
    }

    // Authorization check - ensure user has workflow management permissions
    if (!hasWorkflowPermission(authResult.user)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Insufficient permissions to start workflow' },
        { status: 403 }
      );
    }

    logger.info('Starting cash clearing workflow', {
      userId: getUserIdOrFallback(authResult) || 'system',
      requestData: validatedData,
      clientIp: getClientIP(request)
    });

    // Initialize processor with validated options
    const processor = new CashClearingProcessor({
      batchSize: validatedData.batchSize,
      requireHumanApproval: validatedData.requireHumanApproval,
      approvalThreshold: validatedData.approvalThreshold,
      maxConcurrentSteps: validatedData.maxConcurrentSteps,
      enableAuditLog: validatedData.enableAuditLog,
      userId: getUserIdOrFallback(authResult) || 'system'
    });

    // Get pre-workflow transaction count for estimation
    // TODO: Implement estimateWorkflowSize method in CashClearingProcessor
    // For now, we'll query directly
    const mcpClient = getCashClearingMcpClient();
    const dataset = 'ksingamsetty-test.AI_POC';
    
    const countQuery = `
      SELECT COUNT(*) as transaction_count
      FROM ${dataset}.cash_transactions
      WHERE pattern = 'T_NOTFOUND'
        AND processing_status IS NULL
    `;
    
    const countResult = await mcpClient.executeQueryWithRetry(countQuery);
    const estimationResult = {
      transactionCount: countResult[0]?.transaction_count || 0,
      estimatedProcessingTime: (countResult[0]?.transaction_count || 0) * 0.5 // 0.5 seconds per transaction estimate
    };
    
    if (estimationResult.transactionCount === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'NO_TRANSACTIONS',
          message: 'No unprocessed transactions found matching the criteria',
          transactionCount: 0
        },
        { status: 400 }
      );
    }

    // Start the workflow asynchronously
    const workflowPromise = processor.executeCashClearingWorkflow({
      ...validatedData,
      initiatedBy: getUserIdOrFallback(authResult),
      initiatedAt: new Date().toISOString()
    });

    // Don't await the full workflow, just get the initial response
    const workflowInit = await Promise.race([
      workflowPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Workflow initialization timeout')), 10000)
      )
    ]).catch(async (error) => {
      // If workflow fails to start, return the error immediately
      if (error.message === 'Workflow initialization timeout') {
        // The workflow is still running in background, return success
        const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        return {
          workflowId: `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          batchId,
          results: null
        };
      }
      throw error;
    });

    const result = workflowInit as any;
    batchId = result.batchId;

    // Calculate estimated processing time based on transaction count
    const estimatedTimeMs = estimationResult.transactionCount * 500; // ~500ms per transaction
    const estimatedTimeStr = formatDuration(estimatedTimeMs);

    const response: WorkflowStartResponse = {
      success: true,
      workflowId: result.workflowId,
      batchId: result.batchId,
      estimatedTransactions: estimationResult.transactionCount,
      estimatedProcessingTime: estimatedTimeStr,
      status: 'RUNNING',
      statusUrl: `/api/cash-clearing/workflow/${result.batchId}/status`,
      message: `Workflow started successfully with ${estimationResult.transactionCount} transactions`
    };

    logger.info('Workflow started successfully', {
      workflowId: result.workflowId,
      batchId: result.batchId,
      userId: getUserIdOrFallback(authResult) || 'system',
      transactionCount: estimationResult.transactionCount,
      processingTimeMs: Date.now() - startTime
    });

    return NextResponse.json(response, {
      status: 202, // Accepted - processing asynchronously
      headers: {
        'X-Workflow-Id': result.workflowId,
        'X-Batch-Id': result.batchId,
        'Location': `/api/cash-clearing/workflow/${result.batchId}/status`
      }
    });

  } catch (error) {
    logger.error('Failed to start workflow', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      batchId,
      processingTimeMs: Date.now() - startTime
    });

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          message: 'Invalid request parameters',
          details: error.errors
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to start workflow',
        batchId: batchId || undefined
      },
      { status: 500 }
    );
  }
}

/**
 * Helper functions
 */
function getClientIdentifier(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0] || request.headers.get('x-real-ip') || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  return `${ip}:${userAgent.substring(0, 50)}`;
}

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0] || request.headers.get('x-real-ip') || 'unknown';
}

async function authenticateRequest(request: NextRequest): Promise<AuthResult> {
  // Implementation depends on your auth strategy
  // This is a placeholder for JWT/API key authentication
  const authHeader = request.headers.get('authorization');
  const apiKey = request.headers.get('x-api-key');

  if (apiKey) {
    // API Key authentication
    const isValid = await validateApiKey(apiKey);
    if (isValid) {
      return {
        success: true,
        user: { id: 'api-user', type: 'api' as const, permissions: ['workflow:manage'] }
      };
    }
  }

  if (authHeader?.startsWith('Bearer ')) {
    // JWT authentication
    const token = authHeader.substring(7);
    const user = await validateJWT(token);
    if (user) {
      return { success: true, user };
    }
  }

  return { success: false };
}

async function validateApiKey(apiKey: string): Promise<boolean> {
  // Implement your API key validation logic
  // This is a placeholder
  return process.env.CASH_CLEARING_API_KEY === apiKey;
}

async function validateJWT(token: string): Promise<any> {
  // Implement your JWT validation logic
  // This is a placeholder
  try {
    // In a real implementation, you'd verify the JWT signature
    // and extract user information
    return { id: 'user-123', permissions: ['workflow:manage'] };
  } catch {
    return null;
  }
}

function hasWorkflowPermission(user: any): boolean {
  return user.permissions?.includes('workflow:manage') || user.type === 'api';
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