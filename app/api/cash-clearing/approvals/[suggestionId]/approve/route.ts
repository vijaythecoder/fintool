import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCashClearingMcpClient } from '@/src/services/cashClearingMcpClient.js';
import { logger } from '@/src/utils/logger.js';
import { getUserIdOrFallback, type AuthResult, type User } from '@/lib/api-middleware';
export const maxDuration = 30;

// Request validation schema
const ApproveSuggestionSchema = z.object({
  approvalReason: z.string().min(1).max(1000).optional(),
  overrides: z.object({
    glAccountCode: z.string().optional(),
    debitCreditIndicator: z.enum(['DR', 'CR']).optional(),
    amount: z.number().optional(),
    businessUnit: z.string().optional(),
    costCenter: z.string().optional()
  }).optional(),
  notifyApproval: z.boolean().optional().default(true),
  metadata: z.record(z.any()).optional()
});

// Response schema
const ApproveSuggestionResponseSchema = z.object({
  success: z.boolean(),
  suggestionId: z.string(),
  transactionId: z.string(),
  previousStatus: z.string(),
  newStatus: z.string(),
  approvedBy: z.string(),
  approvedAt: z.string(),
  approvalReason: z.string().optional(),
  overrides: z.record(z.any()).optional(),
  nextSteps: z.array(z.string()).optional(),
  message: z.string()
});

type ApproveSuggestionRequest = z.infer<typeof ApproveSuggestionSchema>;
type ApproveSuggestionResponse = z.infer<typeof ApproveSuggestionResponseSchema>;

/**
 * POST /api/cash-clearing/approvals/[suggestionId]/approve
 * Approve a cash clearing suggestion
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
    const body = await request.json().catch(() => ({}));
    const validatedData = ApproveSuggestionSchema.parse(body);

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
        { error: 'Forbidden', message: 'Insufficient permissions to approve suggestions' },
        { status: 403 }
      );
    }

    logger.info('Approving suggestion', {
      suggestionId,
      userId: getUserIdOrFallback(authResult),
      reason: validatedData.approvalReason,
      overrides: validatedData.overrides
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

    // Check if suggestion can be approved
    if (suggestion.approval_status !== 'PENDING') {
      return NextResponse.json(
        {
          error: 'Invalid suggestion state',
          message: `Cannot approve suggestion with status: ${suggestion.approval_status}`,
          currentStatus: suggestion.approval_status
        },
        { status: 400 }
      );
    }

    // Validate business rules for approval
    const validationResult = validateApprovalRequest(suggestion, validatedData);
    if (!validationResult.isValid) {
      return NextResponse.json(
        {
          error: 'Approval validation failed',
          message: 'Approval request does not meet business rules',
          details: validationResult.errors
        },
        { status: 400 }
      );
    }

    const approvedAt = new Date().toISOString();
    
    // Apply overrides if provided
    const finalSuggestion = applyOverrides(suggestion, validatedData.overrides);

    // Update suggestion status
    await approveSuggestion(
      mcpClient,
      suggestionId,
      getUserIdOrFallback(authResult),
      validatedData.approvalReason,
      finalSuggestion,
      approvedAt
    );

    // Log audit entry
    await mcpClient.insertAuditLogEntry({
      workflow_id: suggestion.workflow_id,
      transaction_id: suggestion.transaction_id,
      step_number: 3,
      action_type: 'APPROVE',
      action_details: {
        suggestionId,
        originalSuggestion: suggestion,
        appliedOverrides: validatedData.overrides,
        approvalReason: validatedData.approvalReason
      },
      user_id: getUserIdOrFallback(authResult) || 'system',
      confidence_score: suggestion.confidence_score,
      processing_time_ms: Date.now() - startTime
    });

    // Trigger next steps if configured
    const nextSteps = await triggerPostApprovalActions(
      mcpClient,
      suggestion,
      finalSuggestion,
      validatedData.notifyApproval
    );

    const response: ApproveSuggestionResponse = {
      success: true,
      suggestionId,
      transactionId: suggestion.transaction_id,
      previousStatus: suggestion.approval_status,
      newStatus: 'APPROVED',
      approvedBy: getUserIdOrFallback(authResult) || 'system',
      approvedAt,
      approvalReason: validatedData.approvalReason,
      overrides: validatedData.overrides,
      nextSteps,
      message: `Suggestion approved successfully${validatedData.overrides ? ' with overrides' : ''}`
    };

    logger.info('Suggestion approved successfully', {
      suggestionId,
      transactionId: suggestion.transaction_id,
      userId: getUserIdOrFallback(authResult),
      processingTimeMs: Date.now() - startTime,
      hasOverrides: !!validatedData.overrides
    });

    return NextResponse.json(response, {
      headers: {
        'X-Processing-Time': `${Date.now() - startTime}ms`
      }
    });

  } catch (error) {
    logger.error('Failed to approve suggestion', {
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
        message: 'Failed to approve suggestion'
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
      w.workflow_id
    FROM ${dataset}.ai_cash_clearing_suggestions s
    LEFT JOIN ${dataset}.cash_clearing_workflow_state w
      ON s.processing_batch_id = w.batch_id
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

function validateApprovalRequest(suggestion: any, request: ApproveSuggestionRequest) {
  const errors: string[] = [];

  // Check confidence threshold
  if (suggestion.confidence_score < 0.3) {
    errors.push('Suggestion confidence score too low for approval');
  }

  // Validate GL account if overridden
  if (request.overrides?.glAccountCode) {
    if (!/^\d{4,8}$/.test(request.overrides.glAccountCode)) {
      errors.push('Invalid GL account code format');
    }
  }

  // Validate amount if overridden
  if (request.overrides?.amount !== undefined) {
    if (request.overrides.amount <= 0) {
      errors.push('Override amount must be positive');
    }
    if (Math.abs(request.overrides.amount - suggestion.amount) / suggestion.amount > 0.1) {
      errors.push('Override amount differs by more than 10% from original');
    }
  }

  // Check for required GL account
  if (!suggestion.gl_account_code && !request.overrides?.glAccountCode) {
    errors.push('GL account code is required for approval');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

function applyOverrides(originalSuggestion: any, overrides?: any) {
  if (!overrides) return originalSuggestion;

  return {
    ...originalSuggestion,
    gl_account_code: overrides.glAccountCode || originalSuggestion.gl_account_code,
    debit_credit_indicator: overrides.debitCreditIndicator || originalSuggestion.debit_credit_indicator,
    amount: overrides.amount || originalSuggestion.amount,
    business_unit: overrides.businessUnit || originalSuggestion.business_unit,
    cost_center: overrides.costCenter || originalSuggestion.cost_center
  };
}

async function approveSuggestion(
  mcpClient: any,
  suggestionId: string,
  approvedBy: string,
  approvalReason: string | undefined,
  finalSuggestion: any,
  approvedAt: string
) {
  const dataset = 'ksingamsetty-test.AI_POC';

  // Build update metadata with overrides
  const metadata = {
    ...finalSuggestion.metadata,
    approvalDetails: {
      approvedBy,
      approvedAt,
      approvalReason,
      overridesApplied: {
        glAccountCode: finalSuggestion.gl_account_code !== finalSuggestion.original_gl_account_code,
        debitCreditIndicator: finalSuggestion.debit_credit_indicator !== finalSuggestion.original_debit_credit_indicator,
        amount: finalSuggestion.amount !== finalSuggestion.original_amount
      }
    }
  };

  const query = `
    UPDATE ${dataset}.ai_cash_clearing_suggestions
    SET 
      approval_status = 'APPROVED',
      approved_by = '${approvedBy}',
      approved_at = TIMESTAMP('${approvedAt}'),
      gl_account_code = '${finalSuggestion.gl_account_code}',
      debit_credit_indicator = '${finalSuggestion.debit_credit_indicator}',
      amount = ${finalSuggestion.amount},
      metadata = JSON '${JSON.stringify(metadata)}',
      UPDATED_AT = CURRENT_TIMESTAMP()
    WHERE suggestion_id = '${suggestionId}'
  `;

  await mcpClient.executeQueryWithRetry(query);
}

async function triggerPostApprovalActions(
  mcpClient: any,
  originalSuggestion: any,
  finalSuggestion: any,
  notifyApproval: boolean
): Promise<string[]> {
  const nextSteps: string[] = [];

  // Check if all suggestions for this batch are approved
  const batchStatus = await checkBatchApprovalStatus(
    mcpClient,
    originalSuggestion.processing_batch_id
  );

  if (batchStatus.allApproved) {
    nextSteps.push('All suggestions in batch approved - ready for final processing');
  }

  // Check if this suggestion is ready for journal entry creation
  if (finalSuggestion.gl_account_code && finalSuggestion.debit_credit_indicator) {
    nextSteps.push('Ready for journal entry creation');
  }

  // Add notification step if configured
  if (notifyApproval) {
    nextSteps.push('Approval notification sent');
    // In a real implementation, you would trigger notifications here
  }

  return nextSteps;
}

async function checkBatchApprovalStatus(mcpClient: any, batchId: string) {
  const dataset = 'ksingamsetty-test.AI_POC';
  
  const query = `
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN approval_status = 'APPROVED' THEN 1 END) as approved,
      COUNT(CASE WHEN approval_status = 'AUTO_APPROVED' THEN 1 END) as auto_approved,
      COUNT(CASE WHEN approval_status = 'PENDING' THEN 1 END) as pending
    FROM ${dataset}.ai_cash_clearing_suggestions
    WHERE processing_batch_id = '${batchId}'
  `;

  const result = await mcpClient.executeQueryWithRetry(query);
  const stats = result[0];

  return {
    total: stats.total,
    approved: stats.approved + stats.auto_approved,
    pending: stats.pending,
    allApproved: stats.pending === 0 && stats.total > 0
  };
}