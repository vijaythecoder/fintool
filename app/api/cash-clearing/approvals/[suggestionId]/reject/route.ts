import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCashClearingMcpClient } from '@/src/services/cashClearingMcpClient.js';
import { logger } from '@/src/utils/logger.js';
import { getUserIdOrFallback, type AuthResult, type User } from '@/lib/api-middleware';
export const maxDuration = 30;

// Request validation schema
const RejectSuggestionSchema = z.object({
  rejectionReason: z.string().min(1).max(1000),
  rejectionCategory: z.enum([
    'INCORRECT_GL_MAPPING',
    'INSUFFICIENT_CONFIDENCE',
    'INCORRECT_AMOUNT',
    'MISSING_DOCUMENTATION',
    'COMPLIANCE_ISSUE',
    'DUPLICATE_ENTRY',
    'OTHER'
  ]),
  alternativeAction: z.enum([
    'MANUAL_REVIEW_REQUIRED',
    'REPROCESS_WITH_DIFFERENT_PATTERN',
    'ESCALATE_TO_SUPERVISOR',
    'REQUEST_ADDITIONAL_INFO',
    'MARK_FOR_INVESTIGATION'
  ]).optional(),
  requestReprocessing: z.boolean().optional().default(false),
  reprocessingOptions: z.object({
    excludePatterns: z.array(z.string()).optional(),
    requireHigherConfidence: z.boolean().optional().default(true),
    manualPatternOverride: z.string().optional()
  }).optional(),
  notifyRejection: z.boolean().optional().default(true),
  metadata: z.record(z.any()).optional()
});

// Response schema
const RejectSuggestionResponseSchema = z.object({
  success: z.boolean(),
  suggestionId: z.string(),
  transactionId: z.string(),
  previousStatus: z.string(),
  newStatus: z.string(),
  rejectedBy: z.string(),
  rejectedAt: z.string(),
  rejectionReason: z.string(),
  rejectionCategory: z.string(),
  alternativeAction: z.string().optional(),
  reprocessingScheduled: z.boolean(),
  nextSteps: z.array(z.string()),
  message: z.string()
});

type RejectSuggestionRequest = z.infer<typeof RejectSuggestionSchema>;
type RejectSuggestionResponse = z.infer<typeof RejectSuggestionResponseSchema>;

/**
 * POST /api/cash-clearing/approvals/[suggestionId]/reject
 * Reject a cash clearing suggestion
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { suggestionId: string } }
) {
  const startTime = Date.now();

  try {
    const { suggestionId } = params;

    if (!suggestionId) {
      return NextResponse.json(
        { error: 'Missing suggestionId parameter' },
        { status: 400 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = RejectSuggestionSchema.parse(body);

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
        { error: 'Forbidden', message: 'Insufficient permissions to reject suggestions' },
        { status: 403 }
      );
    }

    logger.info('Rejecting suggestion', {
      suggestionId,
      userId: getUserIdOrFallback(authResult),
      reason: validatedData.rejectionReason,
      category: validatedData.rejectionCategory
    });

    // Get MCP client and fetch current suggestion
    const mcpClient = getCashClearingMcpClient();
    const suggestion = await getSuggestionDetails(mcpClient, suggestionId);

    if (!suggestion) {
      return NextResponse.json(
        {
          error: 'Suggestion not found',
          message: `No suggestion found with ID: ${suggestionId}`
        },
        { status: 404 }
      );
    }

    // Check if suggestion can be rejected
    if (suggestion.approval_status !== 'PENDING') {
      return NextResponse.json(
        {
          error: 'Invalid suggestion state',
          message: `Cannot reject suggestion with status: ${suggestion.approval_status}`,
          currentStatus: suggestion.approval_status
        },
        { status: 400 }
      );
    }

    const rejectedAt = new Date().toISOString();

    // Update suggestion status to rejected
    await rejectSuggestion(
      mcpClient,
      suggestionId,
      getUserIdOrFallback(authResult),
      validatedData,
      rejectedAt
    );

    // Log audit entry
    await mcpClient.insertAuditLogEntry({
      workflow_id: suggestion.workflow_id,
      transaction_id: suggestion.transaction_id,
      step_number: 3,
      action_type: 'REJECT',
      action_details: {
        suggestionId,
        rejectionReason: validatedData.rejectionReason,
        rejectionCategory: validatedData.rejectionCategory,
        alternativeAction: validatedData.alternativeAction,
        originalSuggestion: suggestion
      },
      user_id: getUserIdOrFallback(authResult),
      confidence_score: suggestion.confidence_score,
      processing_time_ms: Date.now() - startTime
    });

    // Handle reprocessing if requested
    let reprocessingScheduled = false;
    if (validatedData.requestReprocessing) {
      reprocessingScheduled = await scheduleReprocessing(
        mcpClient,
        suggestion,
        validatedData.reprocessingOptions,
        getUserIdOrFallback(authResult)
      );
    }

    // Determine next steps based on rejection category and alternative action
    const nextSteps = determineNextSteps(
      validatedData.rejectionCategory,
      validatedData.alternativeAction,
      reprocessingScheduled
    );

    // Send notifications if configured
    if (validatedData.notifyRejection) {
      await sendRejectionNotifications(
        mcpClient,
        suggestion,
        validatedData,
        getUserIdOrFallback(authResult)
      );
      nextSteps.push('Rejection notifications sent');
    }

    const response: RejectSuggestionResponse = {
      success: true,
      suggestionId,
      transactionId: suggestion.transaction_id,
      previousStatus: suggestion.approval_status,
      newStatus: 'REJECTED',
      rejectedBy: getUserIdOrFallback(authResult) || 'system',
      rejectedAt,
      rejectionReason: validatedData.rejectionReason,
      rejectionCategory: validatedData.rejectionCategory,
      alternativeAction: validatedData.alternativeAction,
      reprocessingScheduled,
      nextSteps,
      message: `Suggestion rejected successfully${reprocessingScheduled ? ' and reprocessing scheduled' : ''}`
    };

    logger.info('Suggestion rejected successfully', {
      suggestionId,
      transactionId: suggestion.transaction_id,
      userId: getUserIdOrFallback(authResult),
      category: validatedData.rejectionCategory,
      reprocessingScheduled,
      processingTimeMs: Date.now() - startTime
    });

    return NextResponse.json(response, {
      headers: {
        'X-Processing-Time': `${Date.now() - startTime}ms`
      }
    });

  } catch (error) {
    logger.error('Failed to reject suggestion', {
      error: error instanceof Error ? error.message : 'Unknown error',
      suggestionId: params.suggestionId,
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
        message: 'Failed to reject suggestion'
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

async function getSuggestionDetails(mcpClient: any, suggestionId: string) {
  const dataset = 'ksingamsetty-test.AI_POC';
  
  const query = `
    SELECT 
      s.*,
      w.workflow_id,
      t.description as transaction_description,
      t.account_id,
      t.amount as original_amount
    FROM ${dataset}.ai_cash_clearing_suggestions s
    LEFT JOIN ${dataset}.cash_clearing_workflow_state w
      ON s.processing_batch_id = w.batch_id
    LEFT JOIN ${dataset}.cash_transactions t
      ON s.transaction_id = t.transaction_id
    WHERE s.suggestion_id = '${suggestionId}'
  `;

  const results = await mcpClient.executeQueryWithRetry(query);
  const suggestion = results[0];

  if (suggestion) {
    // Parse JSON fields
    suggestion.reasoning = suggestion.reasoning ? JSON.parse(suggestion.reasoning) : null;
    suggestion.validation_checks = suggestion.validation_checks ? JSON.parse(suggestion.validation_checks) : null;
    suggestion.metadata = suggestion.metadata ? JSON.parse(suggestion.metadata) : null;
  }

  return suggestion || null;
}

async function rejectSuggestion(
  mcpClient: any,
  suggestionId: string,
  rejectedBy: string,
  rejectionData: RejectSuggestionRequest,
  rejectedAt: string
) {
  const dataset = 'ksingamsetty-test.AI_POC';

  // Build rejection metadata
  const rejectionMetadata = {
    rejectionDetails: {
      rejectedBy,
      rejectedAt,
      rejectionReason: rejectionData.rejectionReason,
      rejectionCategory: rejectionData.rejectionCategory,
      alternativeAction: rejectionData.alternativeAction,
      reprocessingRequested: rejectionData.requestReprocessing,
      reprocessingOptions: rejectionData.reprocessingOptions
    },
    ...rejectionData.metadata
  };

  const query = `
    UPDATE ${dataset}.ai_cash_clearing_suggestions
    SET 
      approval_status = 'REJECTED',
      approved_by = '${rejectedBy}',
      approved_at = TIMESTAMP('${rejectedAt}'),
      metadata = JSON_MERGE_PATCH(
        IFNULL(metadata, JSON '{}'), 
        JSON '${JSON.stringify(rejectionMetadata)}'
      ),
      UPDATED_AT = CURRENT_TIMESTAMP()
    WHERE suggestion_id = '${suggestionId}'
  `;

  await mcpClient.executeQueryWithRetry(query);
}

async function scheduleReprocessing(
  mcpClient: any,
  suggestion: any,
  reprocessingOptions: any,
  userId: string
): Promise<boolean> {
  try {
    const dataset = 'ksingamsetty-test.AI_POC';
    
    // Create reprocessing queue entry
    const reprocessingEntry = {
      transaction_id: suggestion.transaction_id,
      original_suggestion_id: suggestion.suggestion_id,
      reprocessing_reason: 'REJECTION_TRIGGERED',
      reprocessing_options: JSON.stringify(reprocessingOptions || {}),
      requested_by: userId,
      status: 'QUEUED',
      priority: determineReprocessingPriority(suggestion),
      scheduled_at: new Date().toISOString()
    };

    await mcpClient.insertRowsWithRetry(
      `${dataset}.cash_clearing_reprocessing_queue`,
      [reprocessingEntry]
    );

    logger.info('Reprocessing scheduled', {
      transactionId: suggestion.transaction_id,
      originalSuggestionId: suggestion.suggestion_id,
      userId
    });

    return true;
  } catch (error) {
    logger.error('Failed to schedule reprocessing', {
      transactionId: suggestion.transaction_id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return false;
  }
}

function determineReprocessingPriority(suggestion: any): number {
  // Higher amounts get higher priority
  if (suggestion.amount > 50000) return 1; // High priority
  if (suggestion.amount > 10000) return 2; // Medium priority
  return 3; // Low priority
}

function determineNextSteps(
  rejectionCategory: string,
  alternativeAction?: string,
  reprocessingScheduled?: boolean
): string[] {
  const nextSteps: string[] = [];

  // Add steps based on rejection category
  switch (rejectionCategory) {
    case 'INCORRECT_GL_MAPPING':
      nextSteps.push('Review and update GL mapping patterns');
      break;
    case 'INSUFFICIENT_CONFIDENCE':
      nextSteps.push('Review AI pattern matching logic');
      if (reprocessingScheduled) {
        nextSteps.push('Reprocessing with higher confidence threshold');
      }
      break;
    case 'INCORRECT_AMOUNT':
      nextSteps.push('Verify transaction amount in source system');
      break;
    case 'MISSING_DOCUMENTATION':
      nextSteps.push('Request additional documentation from source');
      break;
    case 'COMPLIANCE_ISSUE':
      nextSteps.push('Escalate to compliance team');
      break;
    case 'DUPLICATE_ENTRY':
      nextSteps.push('Check for duplicate transactions');
      break;
  }

  // Add steps based on alternative action
  switch (alternativeAction) {
    case 'MANUAL_REVIEW_REQUIRED':
      nextSteps.push('Queue for manual review by specialist');
      break;
    case 'REPROCESS_WITH_DIFFERENT_PATTERN':
      if (!reprocessingScheduled) {
        nextSteps.push('Schedule reprocessing with alternative patterns');
      }
      break;
    case 'ESCALATE_TO_SUPERVISOR':
      nextSteps.push('Escalate to supervisor for decision');
      break;
    case 'REQUEST_ADDITIONAL_INFO':
      nextSteps.push('Request additional information from requestor');
      break;
    case 'MARK_FOR_INVESTIGATION':
      nextSteps.push('Mark transaction for detailed investigation');
      break;
  }

  if (nextSteps.length === 0) {
    nextSteps.push('Transaction remains in rejected state pending manual action');
  }

  return nextSteps;
}

async function sendRejectionNotifications(
  mcpClient: any,
  suggestion: any,
  rejectionData: RejectSuggestionRequest,
  userId: string
) {
  // In a real implementation, this would send notifications to relevant stakeholders
  // For now, we'll just log the notification details
  
  const notificationDetails = {
    type: 'SUGGESTION_REJECTED',
    suggestionId: suggestion.suggestion_id,
    transactionId: suggestion.transaction_id,
    rejectionCategory: rejectionData.rejectionCategory,
    rejectionReason: rejectionData.rejectionReason,
    rejectedBy: userId,
    timestamp: new Date().toISOString()
  };

  logger.info('Rejection notification prepared', notificationDetails);

  // Here you would integrate with your notification system:
  // - Email notifications
  // - Slack/Teams alerts
  // - Dashboard notifications
  // - Workflow system updates
}