import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { CashClearingProcessor } from '@/src/processors/cashClearingProcessor.js';
import { getCashClearingMcpClient } from '@/src/services/cashClearingMcpClient.js';
import { logger } from '@/src/utils/logger.js';
import { getUserIdOrFallback, type AuthResult, type User } from '@/lib/api-middleware';
export const maxDuration = 60;

// Request validation schema
const ProcessTransactionsSchema = z.object({
  transactionIds: z.array(z.string().min(1)).min(1).max(100),
  processingOptions: z.object({
    batchSize: z.number().min(1).max(100).optional().default(10),
    requireHumanApproval: z.boolean().optional().default(true),
    approvalThreshold: z.number().min(0).max(1).optional().default(0.9),
    skipPatternMatching: z.boolean().optional().default(false),
    forceReprocess: z.boolean().optional().default(false),
    targetStep: z.number().min(1).max(4).optional().default(4)
  }).optional().default({}),
  metadata: z.record(z.any()).optional()
});

// Response schema
const ProcessTransactionsResponseSchema = z.object({
  success: z.boolean(),
  batchId: z.string(),
  workflowId: z.string(),
  processing: z.object({
    submitted: z.number(),
    processing: z.number(),
    completed: z.number(),
    failed: z.number()
  }),
  results: z.array(z.object({
    transaction_id: z.string(),
    status: z.enum(['submitted', 'processing', 'completed', 'failed', 'skipped']),
    confidence_score: z.number().optional(),
    suggestion_id: z.string().optional(),
    gl_account_code: z.string().optional(),
    approval_status: z.string().optional(),
    error: z.string().optional(),
    processing_time_ms: z.number().optional()
  })),
  statusUrl: z.string(),
  estimatedCompletion: z.string().optional(),
  message: z.string()
});

type ProcessTransactionsRequest = z.infer<typeof ProcessTransactionsSchema>;
type ProcessTransactionsResponse = z.infer<typeof ProcessTransactionsResponseSchema>;

/**
 * POST /api/cash-clearing/transactions/process
 * Process a batch of transactions through the cash clearing workflow
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let batchId: string | null = null;

  try {
    // Parse and validate request body
    const body = await request.json();
    const validatedData = ProcessTransactionsSchema.parse(body);

    // Authentication check
    const authResult = await authenticateRequest(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Authorization check
    if (!hasProcessPermission(authResult.user)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Insufficient permissions to process transactions' },
        { status: 403 }
      );
    }

    batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    logger.info('Processing transaction batch', {
      batchId,
      userId: getUserIdOrFallback(authResult),
      transactionCount: validatedData.transactionIds.length,
      options: validatedData.processingOptions
    });

    // Get MCP client and validate transactions exist
    const mcpClient = getCashClearingMcpClient();
    const validationResult = await validateTransactions(mcpClient, validatedData.transactionIds);

    if (validationResult.invalidTransactions.length > 0) {
      return NextResponse.json(
        {
          error: 'Invalid transactions',
          message: 'Some transaction IDs were not found or are not eligible for processing',
          details: {
            invalid: validationResult.invalidTransactions,
            alreadyProcessed: validationResult.alreadyProcessed
          }
        },
        { status: 400 }
      );
    }

    // Initialize processor
    const processor = new CashClearingProcessor({
      ...validatedData.processingOptions,
      userId: getUserIdOrFallback(authResult),
      enableAuditLog: true
    });

    // Create workflow state for this batch
    const workflowState = await initializeBatchWorkflow(
      mcpClient,
      batchId,
      validatedData,
      getUserIdOrFallback(authResult)
    );

    // Start processing asynchronously
    const processingPromise = processBatchOfTransactions(
      processor,
      mcpClient,
      workflowState,
      validatedData
    );

    // Don't wait for completion, return immediate response
    const initialResults = validatedData.transactionIds.map(id => ({
      transaction_id: id,
      status: 'submitted' as const,
      confidence_score: undefined,
      suggestion_id: undefined,
      gl_account_code: undefined,
      approval_status: undefined,
      error: undefined,
      processing_time_ms: undefined
    }));

    // Handle processing completion/failure in background
    processingPromise
      .then(async (results) => {
        await updateWorkflowCompletion(mcpClient, workflowState.workflow_id, results);
        logger.info('Batch processing completed', {
          batchId,
          workflowId: workflowState.workflow_id,
          results: results.summary
        });
      })
      .catch(async (error) => {
        await updateWorkflowError(mcpClient, workflowState.workflow_id, error);
        logger.error('Batch processing failed', {
          batchId,
          workflowId: workflowState.workflow_id,
          error: error.message
        });
      });

    // Calculate estimated completion time
    const estimatedTimeMs = validatedData.transactionIds.length * 500; // ~500ms per transaction
    const estimatedCompletion = new Date(Date.now() + estimatedTimeMs).toISOString();

    const response: ProcessTransactionsResponse = {
      success: true,
      batchId,
      workflowId: workflowState.workflow_id,
      processing: {
        submitted: validatedData.transactionIds.length,
        processing: 0,
        completed: 0,
        failed: 0
      },
      results: initialResults,
      statusUrl: `/api/cash-clearing/workflow/${batchId}/status`,
      estimatedCompletion,
      message: `Batch processing started for ${validatedData.transactionIds.length} transactions`
    };

    return NextResponse.json(response, {
      status: 202, // Accepted - processing asynchronously
      headers: {
        'X-Batch-Id': batchId,
        'X-Workflow-Id': workflowState.workflow_id,
        'Location': `/api/cash-clearing/workflow/${batchId}/status`
      }
    });

  } catch (error) {
    logger.error('Failed to start batch processing', {
      error: error instanceof Error ? error.message : 'Unknown error',
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
        message: 'Failed to start batch processing'
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
      user: { id: 'api-user', type: 'api' as const, permissions: ['transaction:process'] }
    };
  }

  if (authHeader?.startsWith('Bearer ')) {
    return {
      success: true,
      user: { id: 'user-123', type: 'user' as const, permissions: ['transaction:process'] }
    };
  }

  return { success: false };
}

function hasProcessPermission(user: any): boolean {
  return user.permissions?.includes('transaction:process') || user.type === 'api';
}

async function validateTransactions(mcpClient: any, transactionIds: string[]) {
  const dataset = 'ksingamsetty-test.AI_POC';
  const idsString = transactionIds.map(id => `'${id}'`).join(',');

  // Check which transactions exist and their current state
  const query = `
    SELECT 
      t.transaction_id,
      t.pattern,
      CASE WHEN s.transaction_id IS NOT NULL THEN true ELSE false END as has_suggestions
    FROM ${dataset}.cash_transactions t
    LEFT JOIN ${dataset}.ai_cash_clearing_suggestions s 
      ON t.transaction_id = s.transaction_id
    WHERE t.transaction_id IN (${idsString})
  `;

  const results = await mcpClient.executeQueryWithRetry(query);
  const foundIds = new Set(results.map((r: any) => r.transaction_id));
  
  const invalidTransactions = transactionIds.filter(id => !foundIds.has(id));
  const alreadyProcessed = results
    .filter((r: any) => r.has_suggestions && r.pattern !== 'T_NOTFOUND')
    .map((r: any) => r.transaction_id);

  return {
    validTransactions: results.filter((r: any) => !r.has_suggestions || r.pattern === 'T_NOTFOUND'),
    invalidTransactions,
    alreadyProcessed
  };
}

async function initializeBatchWorkflow(
  mcpClient: any,
  batchId: string,
  requestData: ProcessTransactionsRequest,
  userId: string
) {
  const workflowId = `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const workflowState = {
    workflow_id: workflowId,
    batch_id: batchId,
    current_step: 1,
    total_transactions: requestData.transactionIds.length,
    processed_transactions: 0,
    failed_transactions: 0,
    human_approval_required: requestData.processingOptions?.requireHumanApproval ?? true,
    workflow_status: 'RUNNING',
    metadata: JSON.stringify({
      originalRequest: requestData,
      initiatedBy: userId,
      processingType: 'batch',
      targetStep: requestData.processingOptions?.targetStep ?? 4
    })
  };

  await mcpClient.insertRowsWithRetry(
    'ksingamsetty-test.AI_POC.cash_clearing_workflow_state',
    [workflowState]
  );

  // Log audit entry
  await mcpClient.insertAuditLogEntry({
    workflow_id: workflowId,
    step_number: 0,
    action_type: 'BATCH_PROCESSING_STARTED',
    action_details: {
      batchId,
      transactionCount: requestData.transactionIds.length,
      options: requestData.processingOptions
    },
    user_id: userId
  });

  return { ...workflowState, workflow_id: workflowId };
}

async function processBatchOfTransactions(
  processor: any,
  mcpClient: any,
  workflowState: any,
  requestData: ProcessTransactionsRequest
) {
  const startTime = Date.now();
  const results: any[] = [];

  try {
    // Process transactions in smaller batches to avoid timeouts
    const batchSize = requestData.processingOptions?.batchSize ?? 10;
    const transactionBatches = chunk(requestData.transactionIds, batchSize);

    for (let i = 0; i < transactionBatches.length; i++) {
      const batch = transactionBatches[i];
      
      logger.info(`Processing batch ${i + 1}/${transactionBatches.length}`, {
        batchId: workflowState.batch_id,
        transactionIds: batch
      });

      // Process this batch of transactions
      const batchResults = await processor.processSpecificTransactions(
        batch,
        {
          batchId: workflowState.batch_id,
          workflowId: workflowState.workflow_id,
          targetStep: requestData.processingOptions?.targetStep ?? 4
        }
      );

      results.push(...batchResults);

      // Update progress
      await mcpClient.updateWorkflowState(workflowState.workflow_id, {
        processed_transactions: results.filter(r => r.status === 'completed').length,
        failed_transactions: results.filter(r => r.status === 'failed').length
      });
    }

    const summary = {
      totalProcessed: results.length,
      successful: results.filter(r => r.status === 'completed').length,
      failed: results.filter(r => r.status === 'failed').length,
      avgConfidence: calculateAverageConfidence(results),
      processingTimeMs: Date.now() - startTime
    };

    return { results, summary };

  } catch (error) {
    logger.error('Batch processing failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      batchId: workflowState.batch_id,
      processedCount: results.length
    });
    throw error;
  }
}

async function updateWorkflowCompletion(mcpClient: any, workflowId: string, results: any) {
  await mcpClient.updateWorkflowState(workflowId, {
    workflow_status: 'COMPLETED',
    step_4_completed_at: new Date().toISOString(),
    processed_transactions: results.summary.successful,
    failed_transactions: results.summary.failed
  });

  await mcpClient.insertAuditLogEntry({
    workflow_id: workflowId,
    step_number: 4,
    action_type: 'BATCH_PROCESSING_COMPLETED',
    action_details: results.summary
  });
}

async function updateWorkflowError(mcpClient: any, workflowId: string, error: Error) {
  await mcpClient.updateWorkflowState(workflowId, {
    workflow_status: 'FAILED',
    error_details: JSON.stringify({
      error: error.message,
      timestamp: new Date().toISOString()
    })
  });
}

function calculateAverageConfidence(results: any[]): number {
  const resultsWithConfidence = results.filter(r => r.confidence_score !== undefined);
  if (resultsWithConfidence.length === 0) return 0;
  
  const total = resultsWithConfidence.reduce((sum, r) => sum + r.confidence_score, 0);
  return total / resultsWithConfidence.length;
}

function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}