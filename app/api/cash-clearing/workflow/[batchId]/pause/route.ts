import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCashClearingMcpClient } from '@/src/services/cashClearingMcpClient.js';
import { logger } from '@/src/utils/logger.js';
import { getUserIdOrFallback, type AuthResult, type User } from '@/lib/api-middleware';
export const maxDuration = 30;

// Request validation schema
const PauseWorkflowSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
  gracefulShutdown: z.boolean().optional().default(true),
  saveState: z.boolean().optional().default(true)
});

// Response schema
const PauseWorkflowResponseSchema = z.object({
  success: z.boolean(),
  batchId: z.string(),
  previousStatus: z.string(),
  newStatus: z.string(),
  pausedAt: z.string(),
  pausedBy: z.string(),
  reason: z.string().optional(),
  resumeUrl: z.string(),
  message: z.string()
});

type PauseWorkflowRequest = z.infer<typeof PauseWorkflowSchema>;
type PauseWorkflowResponse = z.infer<typeof PauseWorkflowResponseSchema>;

/**
 * POST /api/cash-clearing/workflow/[batchId]/pause
 * Pause a running workflow
 */
export async function POST(
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

    // Parse and validate request body
    const body = await request.json().catch(() => ({}));
    const validatedData = PauseWorkflowSchema.parse(body);

    // Authentication check
    const authResult = await authenticateRequest(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Authorization check - ensure user has workflow management permissions
    if (!hasWorkflowPermission(authResult.user)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Insufficient permissions to pause workflow' },
        { status: 403 }
      );
    }

    logger.info('Pausing workflow', {
      batchId,
      userId: getUserIdOrFallback(authResult),
      reason: validatedData.reason,
      gracefulShutdown: validatedData.gracefulShutdown
    });

    // Get MCP client and check current workflow status
    const mcpClient = getCashClearingMcpClient();
    const currentStatus = await mcpClient.getWorkflowStatus(batchId);

    if (!currentStatus) {
      return NextResponse.json(
        {
          error: 'Workflow not found',
          message: `No workflow found with batchId: ${batchId}`
        },
        { status: 404 }
      );
    }

    // Check if workflow can be paused
    if (currentStatus.workflow_status !== 'RUNNING') {
      return NextResponse.json(
        {
          error: 'Invalid workflow state',
          message: `Cannot pause workflow with status: ${currentStatus.workflow_status}`,
          currentStatus: currentStatus.workflow_status
        },
        { status: 400 }
      );
    }

    // Pause the workflow
    const pausedAt = new Date().toISOString();
    const updateData = {
      workflow_status: 'PAUSED',
      paused_at: pausedAt,
      paused_by: getUserIdOrFallback(authResult),
      pause_reason: validatedData.reason || 'Manual pause',
      metadata: JSON.stringify({
        ...JSON.parse(currentStatus.metadata || '{}'),
        pauseDetails: {
          pausedBy: getUserIdOrFallback(authResult),
          pausedAt,
          reason: validatedData.reason,
          gracefulShutdown: validatedData.gracefulShutdown,
          saveState: validatedData.saveState
        }
      })
    };

    await mcpClient.updateWorkflowState(currentStatus.workflow_id, updateData);

    // Log audit entry
    await mcpClient.insertAuditLogEntry({
      workflow_id: currentStatus.workflow_id,
      step_number: currentStatus.current_step,
      action_type: 'WORKFLOW_PAUSED',
      action_details: {
        previousStatus: currentStatus.workflow_status,
        reason: validatedData.reason,
        gracefulShutdown: validatedData.gracefulShutdown
      },
      user_id: getUserIdOrFallback(authResult),
      processing_time_ms: Date.now() - startTime
    });

    const response: PauseWorkflowResponse = {
      success: true,
      batchId,
      previousStatus: currentStatus.workflow_status,
      newStatus: 'PAUSED',
      pausedAt,
      pausedBy: getUserIdOrFallback(authResult),
      reason: validatedData.reason,
      resumeUrl: `/api/cash-clearing/workflow/${batchId}/resume`,
      message: 'Workflow paused successfully'
    };

    logger.info('Workflow paused successfully', {
      batchId,
      workflowId: currentStatus.workflow_id,
      userId: getUserIdOrFallback(authResult),
      processingTimeMs: Date.now() - startTime
    });

    return NextResponse.json(response, {
      headers: {
        'X-Processing-Time': `${Date.now() - startTime}ms`
      }
    });

  } catch (error) {
    logger.error('Failed to pause workflow', {
      error: error instanceof Error ? error.message : 'Unknown error',
      batchId: params.batchId,
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
        message: 'Failed to pause workflow'
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
      user: { id: 'api-user', type: 'api' as const, permissions: ['workflow:manage'] }
    };
  }

  if (authHeader?.startsWith('Bearer ')) {
    return {
      success: true,
      user: { id: 'user-123', type: 'user' as const, permissions: ['workflow:manage'] }
    };
  }

  return { success: false };
}

function hasWorkflowPermission(user: any): boolean {
  return user.permissions?.includes('workflow:manage') || user.type === 'api';
}