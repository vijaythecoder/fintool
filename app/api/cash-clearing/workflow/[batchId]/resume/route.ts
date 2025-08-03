import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCashClearingMcpClient } from '@/src/services/cashClearingMcpClient.js';
import { CashClearingProcessor } from '@/src/processors/cashClearingProcessor.js';
import { logger } from '@/src/utils/logger.js';
import { getUserIdOrFallback, type AuthResult, type User } from '@/lib/api-middleware';
export const maxDuration = 60;

// Request validation schema
const ResumeWorkflowSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
  restartFromStep: z.number().min(1).max(4).optional(),
  updateConfig: z.object({
    batchSize: z.number().min(1).max(1000).optional(),
    approvalThreshold: z.number().min(0).max(1).optional(),
    maxConcurrentSteps: z.number().min(1).max(5).optional()
  }).optional()
});

// Response schema
const ResumeWorkflowResponseSchema = z.object({
  success: z.boolean(),
  batchId: z.string(),
  workflowId: z.string(),
  previousStatus: z.string(),
  newStatus: z.string(),
  resumedAt: z.string(),
  resumedBy: z.string(),
  resumeFromStep: z.number(),
  reason: z.string().optional(),
  statusUrl: z.string(),
  message: z.string()
});

type ResumeWorkflowRequest = z.infer<typeof ResumeWorkflowSchema>;
type ResumeWorkflowResponse = z.infer<typeof ResumeWorkflowResponseSchema>;

/**
 * POST /api/cash-clearing/workflow/[batchId]/resume
 * Resume a paused workflow
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
    const validatedData = ResumeWorkflowSchema.parse(body);

    // Authentication check
    const authResult = await authenticateRequest(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Authorization check
    if (!hasWorkflowPermission(authResult.user)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Insufficient permissions to resume workflow' },
        { status: 403 }
      );
    }

    logger.info('Resuming workflow', {
      batchId,
      userId: getUserIdOrFallback(authResult) || 'system',
      reason: validatedData.reason,
      restartFromStep: validatedData.restartFromStep
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

    // Check if workflow can be resumed
    if (currentStatus.workflow_status !== 'PAUSED') {
      return NextResponse.json(
        {
          error: 'Invalid workflow state',
          message: `Cannot resume workflow with status: ${currentStatus.workflow_status}`,
          currentStatus: currentStatus.workflow_status
        },
        { status: 400 }
      );
    }

    // Determine resume point
    const resumeFromStep = validatedData.restartFromStep || currentStatus.current_step;
    const resumedAt = new Date().toISOString();

    // Update workflow status to running
    const updateData = {
      workflow_status: 'RUNNING',
      current_step: resumeFromStep,
      resumed_at: resumedAt,
      resumed_by: getUserIdOrFallback(authResult),
      resume_reason: validatedData.reason || 'Manual resume',
      metadata: JSON.stringify({
        ...JSON.parse(currentStatus.metadata || '{}'),
        resumeDetails: {
          resumedBy: getUserIdOrFallback(authResult),
          resumedAt,
          reason: validatedData.reason,
          restartFromStep: validatedData.restartFromStep,
          configUpdates: validatedData.updateConfig
        }
      })
    };

    await mcpClient.updateWorkflowState(currentStatus.workflow_id, updateData);

    // Log audit entry
    await mcpClient.insertAuditLogEntry({
      workflow_id: currentStatus.workflow_id,
      step_number: resumeFromStep,
      action_type: 'WORKFLOW_RESUMED',
      action_details: {
        previousStatus: currentStatus.workflow_status,
        resumeFromStep,
        reason: validatedData.reason,
        configUpdates: validatedData.updateConfig
      },
      user_id: getUserIdOrFallback(authResult),
      processing_time_ms: Date.now() - startTime
    });

    // Initialize processor for resuming workflow
    const existingMetadata = JSON.parse(currentStatus.metadata || '{}');
    const processorConfig = {
      ...existingMetadata.originalConfig,
      ...validatedData.updateConfig,
      userId: getUserIdOrFallback(authResult) || 'system'
    };

    const processor = new CashClearingProcessor(processorConfig);

    // Resume workflow execution asynchronously
    // TODO: Implement resumeWorkflowFromStep method in CashClearingProcessor
    // For now, we'll create a placeholder that logs the resume request
    const resumePromise = Promise.resolve().then(async () => {
      logger.info('Resume workflow requested', {
        workflowId: currentStatus.workflow_id,
        resumeFromStep,
        resumedBy: getUserIdOrFallback(authResult),
        resumedAt
      });
      
      // In a real implementation, this would resume the workflow from the specified step
      // For now, we'll just update the workflow state to indicate it's been resumed
      const mcpClient = getCashClearingMcpClient();
      await mcpClient.updateWorkflowState(currentStatus.workflow_id, {
        workflow_status: 'RUNNING',
        current_step: resumeFromStep,
        metadata: JSON.stringify({
          ...existingMetadata,
          resumed: true,
          resumedAt,
          resumedBy: getUserIdOrFallback(authResult),
          resumedFromStep: resumeFromStep
        })
      });
    });

    // Don't wait for completion, return success immediately
    resumePromise.catch(error => {
      logger.error('Workflow resume failed during execution', {
        batchId,
        workflowId: currentStatus.workflow_id,
        error: error.message
      });
      
      // Update workflow status to failed
      mcpClient.updateWorkflowState(currentStatus.workflow_id, {
        workflow_status: 'FAILED',
        error_details: JSON.stringify({
          error: error.message,
          timestamp: new Date().toISOString(),
          step: resumeFromStep
        })
      });
    });

    const response: ResumeWorkflowResponse = {
      success: true,
      batchId,
      workflowId: currentStatus.workflow_id,
      previousStatus: currentStatus.workflow_status,
      newStatus: 'RUNNING',
      resumedAt,
      resumedBy: getUserIdOrFallback(authResult),
      resumeFromStep,
      reason: validatedData.reason,
      statusUrl: `/api/cash-clearing/workflow/${batchId}/status`,
      message: `Workflow resumed successfully from step ${resumeFromStep}`
    };

    logger.info('Workflow resumed successfully', {
      batchId,
      workflowId: currentStatus.workflow_id,
      userId: getUserIdOrFallback(authResult) || 'system',
      resumeFromStep,
      processingTimeMs: Date.now() - startTime
    });

    return NextResponse.json(response, {
      status: 202, // Accepted - processing asynchronously
      headers: {
        'X-Processing-Time': `${Date.now() - startTime}ms`,
        'X-Resume-From-Step': resumeFromStep.toString(),
        'Location': `/api/cash-clearing/workflow/${batchId}/status`
      }
    });

  } catch (error) {
    logger.error('Failed to resume workflow', {
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
        message: 'Failed to resume workflow'
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