import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCashClearingMcpClient } from '@/src/services/cashClearingMcpClient.js';
import { logger } from '@/src/utils/logger.js';
import { getUserIdOrFallback, type AuthResult, type User } from '@/lib/api-middleware';
export const maxDuration = 60;

// Request validation schema
const BatchApprovalSchema = z.object({
  suggestionIds: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(['APPROVE', 'REJECT']),
  batchReason: z.string().min(1).max(1000),
  individualReasons: z.record(z.string(), z.string().max(1000)).optional(),
  approvalSettings: z.object({
    requireIndividualReasons: z.boolean().optional().default(false),
    allowPartialFailure: z.boolean().optional().default(true),
    stopOnFirstError: z.boolean().optional().default(false)
  }).optional().default({}),
  rejectionSettings: z.object({
    rejectionCategory: z.enum([
      'INCORRECT_GL_MAPPING',
      'INSUFFICIENT_CONFIDENCE',
      'INCORRECT_AMOUNT',
      'MISSING_DOCUMENTATION',
      'COMPLIANCE_ISSUE',
      'DUPLICATE_ENTRY',
      'OTHER'
    ]).optional().default('OTHER'),
    requestReprocessing: z.boolean().optional().default(false)
  }).optional(),
  notifyBatch: z.boolean().optional().default(true),
  metadata: z.record(z.any()).optional()
});

// Response schema
const BatchApprovalResponseSchema = z.object({
  success: z.boolean(),
  batchId: z.string(),
  action: z.enum(['APPROVE', 'REJECT']),
  processing: z.object({
    total: z.number(),
    successful: z.number(),
    failed: z.number(),
    skipped: z.number()
  }),
  results: z.array(z.object({
    suggestionId: z.string(),
    transactionId: z.string(),
    status: z.enum(['SUCCESS', 'FAILED', 'SKIPPED']),
    previousStatus: z.string(),
    newStatus: z.string().optional(),
    reason: z.string().optional(),
    error: z.string().optional(),
    processingTimeMs: z.number()
  })),
  summary: z.object({
    totalProcessingTime: z.number(),
    averageTimePerSuggestion: z.number(),
    successRate: z.number(),
    errors: z.array(z.object({
      suggestionId: z.string(),
      error: z.string(),
      category: z.string()
    })).optional()
  }),
  nextSteps: z.array(z.string()),
  message: z.string()
});

type BatchApprovalRequest = z.infer<typeof BatchApprovalSchema>;
type BatchApprovalResponse = z.infer<typeof BatchApprovalResponseSchema>;

/**
 * POST /api/cash-clearing/approvals/batch
 * Batch approve or reject multiple suggestions
 */
export async function POST(request: NextRequest) {
  const batchStartTime = Date.now();
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    // Parse and validate request body
    const body = await request.json();
    const validatedData = BatchApprovalSchema.parse(body);

    // Authentication check
    const authResult = await authenticateRequest(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Authorization check
    if (!hasApprovalPermission(authResult.user)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Insufficient permissions for batch approvals' },
        { status: 403 }
      );
    }

    // Validate batch size limits
    if (validatedData.suggestionIds.length > 100) {
      return NextResponse.json(
        { error: 'Batch too large', message: 'Maximum 100 suggestions per batch' },
        { status: 400 }
      );
    }

    logger.info('Starting batch approval operation', {
      batchId,
      userId: getUserIdOrFallback(authResult),
      action: validatedData.action,
      suggestionCount: validatedData.suggestionIds.length,
      reason: validatedData.batchReason
    });

    // Get MCP client
    const mcpClient = getCashClearingMcpClient();

    // Validate all suggestions exist and are in valid state
    const validationResult = await validateBatchSuggestions(
      mcpClient,
      validatedData.suggestionIds
    );

    if (validationResult.invalidSuggestions.length > 0) {
      return NextResponse.json(
        {
          error: 'Invalid suggestions in batch',
          message: 'Some suggestions are not eligible for this action',
          details: {
            invalid: validationResult.invalidSuggestions,
            notPending: validationResult.notPendingSuggestions
          }
        },
        { status: 400 }
      );
    }

    // Process the batch
    const batchResults = await processBatchAction(
      mcpClient,
      validatedData,
      getUserIdOrFallback(authResult),
      batchId
    );

    // Log batch audit entry
    await mcpClient.insertAuditLogEntry({
      step_number: 3,
      action_type: `BATCH_${validatedData.action}`,
      action_details: {
        batchId,
        suggestionCount: validatedData.suggestionIds.length,
        successful: batchResults.successful,
        failed: batchResults.failed,
        batchReason: validatedData.batchReason
      },
      user_id: getUserIdOrFallback(authResult),
      processing_time_ms: Date.now() - batchStartTime
    });

    // Calculate summary statistics
    const totalProcessingTime = Date.now() - batchStartTime;
    const summary = {
      totalProcessingTime,
      averageTimePerSuggestion: totalProcessingTime / validatedData.suggestionIds.length,
      successRate: batchResults.successful / validatedData.suggestionIds.length,
      errors: batchResults.errors.length > 0 ? batchResults.errors : undefined
    };

    // Determine next steps
    const nextSteps = determineNextSteps(validatedData, batchResults);

    // Send notifications if configured
    if (validatedData.notifyBatch) {
      await sendBatchNotifications(
        mcpClient,
        validatedData,
        batchResults,
        getUserIdOrFallback(authResult),
        batchId
      );
      nextSteps.push('Batch notification sent');
    }

    const response: BatchApprovalResponse = {
      success: batchResults.failed === 0 || validatedData.approvalSettings?.allowPartialFailure,
      batchId,
      action: validatedData.action,
      processing: {
        total: validatedData.suggestionIds.length,
        successful: batchResults.successful,
        failed: batchResults.failed,
        skipped: batchResults.skipped
      },
      results: batchResults.results,
      summary,
      nextSteps,
      message: `Batch ${validatedData.action.toLowerCase()} operation completed: ${batchResults.successful}/${validatedData.suggestionIds.length} successful`
    };

    logger.info('Batch approval operation completed', {
      batchId,
      userId: getUserIdOrFallback(authResult),
      action: validatedData.action,
      results: batchResults,
      processingTimeMs: totalProcessingTime
    });

    return NextResponse.json(response, {
      status: batchResults.failed > 0 && !validatedData.approvalSettings?.allowPartialFailure ? 207 : 200,
      headers: {
        'X-Batch-Id': batchId,
        'X-Processing-Time': `${totalProcessingTime}ms`,
        'X-Success-Rate': `${(summary.successRate * 100).toFixed(1)}%`
      }
    });

  } catch (error) {
    logger.error('Batch approval operation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      batchId,
      processingTimeMs: Date.now() - batchStartTime
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
        message: 'Failed to process batch approval'
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
      user: { id: 'api-user', type: 'api' as const, permissions: ['approval:manage'] }
    };
  }

  if (authHeader?.startsWith('Bearer ')) {
    return {
      success: true,
      user: { id: 'user-123', type: 'user' as const, permissions: ['approval:manage'] }
    };
  }

  return { success: false };
}

function hasApprovalPermission(user: any): boolean {
  return user.permissions?.includes('approval:manage') || user.type === 'api';
}

async function validateBatchSuggestions(mcpClient: any, suggestionIds: string[]) {
  const dataset = 'ksingamsetty-test.AI_POC';
  const idsString = suggestionIds.map(id => `'${id}'`).join(',');

  const query = `
    SELECT 
      suggestion_id,
      approval_status,
      confidence_score
    FROM ${dataset}.ai_cash_clearing_suggestions
    WHERE suggestion_id IN (${idsString})
  `;

  const results = await mcpClient.executeQueryWithRetry(query);
  const foundIds = new Set(results.map((r: any) => r.suggestion_id));
  
  const invalidSuggestions = suggestionIds.filter(id => !foundIds.has(id));
  const notPendingSuggestions = results
    .filter((r: any) => r.approval_status !== 'PENDING')
    .map((r: any) => ({ id: r.suggestion_id, status: r.approval_status }));

  return {
    validSuggestions: results.filter((r: any) => r.approval_status === 'PENDING'),
    invalidSuggestions,
    notPendingSuggestions
  };
}

async function processBatchAction(
  mcpClient: any,
  requestData: BatchApprovalRequest,
  userId: string,
  batchId: string
) {
  const results: any[] = [];
  const errors: any[] = [];
  let successful = 0;
  let failed = 0;
  let skipped = 0;

  for (const suggestionId of requestData.suggestionIds) {
    const startTime = Date.now();
    
    try {
      // Get individual reason if provided
      const individualReason = requestData.individualReasons?.[suggestionId] || requestData.batchReason;

      // Process individual suggestion
      const result = await processIndividualSuggestion(
        mcpClient,
        suggestionId,
        requestData.action,
        individualReason,
        requestData,
        userId
      );

      results.push({
        suggestionId,
        transactionId: result.transactionId,
        status: 'SUCCESS',
        previousStatus: result.previousStatus,
        newStatus: result.newStatus,
        reason: individualReason,
        processingTimeMs: Date.now() - startTime
      });

      successful++;

      // Stop on first error if configured
      if (requestData.approvalSettings?.stopOnFirstError && failed > 0) {
        break;
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      results.push({
        suggestionId,
        transactionId: 'unknown',
        status: 'FAILED',
        previousStatus: 'unknown',
        error: errorMessage,
        processingTimeMs: Date.now() - startTime
      });

      errors.push({
        suggestionId,
        error: errorMessage,
        category: 'PROCESSING_ERROR'
      });

      failed++;

      // Stop on first error if configured
      if (requestData.approvalSettings?.stopOnFirstError) {
        // Mark remaining suggestions as skipped
        const remainingIds = requestData.suggestionIds.slice(
          requestData.suggestionIds.indexOf(suggestionId) + 1
        );
        
        remainingIds.forEach(id => {
          results.push({
            suggestionId: id,
            transactionId: 'unknown',
            status: 'SKIPPED',
            previousStatus: 'unknown',
            reason: 'Stopped due to error in batch',
            processingTimeMs: 0
          });
          skipped++;
        });
        
        break;
      }
    }
  }

  return {
    results,
    errors,
    successful,
    failed,
    skipped
  };
}

async function processIndividualSuggestion(
  mcpClient: any,
  suggestionId: string,
  action: 'APPROVE' | 'REJECT',
  reason: string,
  requestData: BatchApprovalRequest,
  userId: string
) {
  const dataset = 'ksingamsetty-test.AI_POC';

  // Get current suggestion details
  const suggestion = await mcpClient.executeQueryWithRetry(`
    SELECT * FROM ${dataset}.ai_cash_clearing_suggestions
    WHERE suggestion_id = '${suggestionId}' AND approval_status = 'PENDING'
  `);

  if (suggestion.length === 0) {
    throw new Error(`Suggestion ${suggestionId} not found or not in PENDING status`);
  }

  const currentSuggestion = suggestion[0];
  const timestamp = new Date().toISOString();

  if (action === 'APPROVE') {
    // Update to approved
    await mcpClient.executeQueryWithRetry(`
      UPDATE ${dataset}.ai_cash_clearing_suggestions
      SET 
        approval_status = 'APPROVED',
        approved_by = '${userId}',
        approved_at = TIMESTAMP('${timestamp}'),
        metadata = JSON_MERGE_PATCH(
          IFNULL(metadata, JSON '{}'),
          JSON '{"batchApproval": {"reason": "${reason}", "batchId": "${requestData.batchReason}"}}'
        ),
        UPDATED_AT = CURRENT_TIMESTAMP()
      WHERE suggestion_id = '${suggestionId}'
    `);

    return {
      transactionId: currentSuggestion.transaction_id,
      previousStatus: 'PENDING',
      newStatus: 'APPROVED'
    };

  } else {
    // Update to rejected
    const rejectionCategory = requestData.rejectionSettings?.rejectionCategory || 'OTHER';
    
    await mcpClient.executeQueryWithRetry(`
      UPDATE ${dataset}.ai_cash_clearing_suggestions
      SET 
        approval_status = 'REJECTED',
        approved_by = '${userId}',
        approved_at = TIMESTAMP('${timestamp}'),
        metadata = JSON_MERGE_PATCH(
          IFNULL(metadata, JSON '{}'),
          JSON '{"batchRejection": {"reason": "${reason}", "category": "${rejectionCategory}", "batchId": "${requestData.batchReason}"}}'
        ),
        UPDATED_AT = CURRENT_TIMESTAMP()
      WHERE suggestion_id = '${suggestionId}'
    `);

    return {
      transactionId: currentSuggestion.transaction_id,
      previousStatus: 'PENDING',
      newStatus: 'REJECTED'
    };
  }
}

function determineNextSteps(requestData: BatchApprovalRequest, batchResults: any): string[] {
  const nextSteps: string[] = [];

  if (requestData.action === 'APPROVE') {
    nextSteps.push(`${batchResults.successful} suggestions approved and ready for processing`);
    if (batchResults.successful > 0) {
      nextSteps.push('Check if batch is ready for journal entry creation');
    }
  } else {
    nextSteps.push(`${batchResults.successful} suggestions rejected`);
    if (requestData.rejectionSettings?.requestReprocessing) {
      nextSteps.push('Reprocessing scheduled for rejected transactions');
    }
  }

  if (batchResults.failed > 0) {
    nextSteps.push(`${batchResults.failed} suggestions failed to process - review errors`);
  }

  if (batchResults.skipped > 0) {
    nextSteps.push(`${batchResults.skipped} suggestions skipped - may need individual attention`);
  }

  return nextSteps;
}

async function sendBatchNotifications(
  mcpClient: any,
  requestData: BatchApprovalRequest,
  batchResults: any,
  userId: string,
  batchId: string
) {
  // In a real implementation, this would send notifications to relevant stakeholders
  const notificationDetails = {
    type: `BATCH_${requestData.action}`,
    batchId,
    action: requestData.action,
    totalSuggestions: requestData.suggestionIds.length,
    successful: batchResults.successful,
    failed: batchResults.failed,
    skipped: batchResults.skipped,
    reason: requestData.batchReason,
    processedBy: userId,
    timestamp: new Date().toISOString()
  };

  logger.info('Batch notification prepared', notificationDetails);

  // Here you would integrate with your notification system
}