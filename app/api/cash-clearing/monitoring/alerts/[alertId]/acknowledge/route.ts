import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { monitoringSystem } from '@/src/utils/monitoringSystem.js';
import { logger } from '@/src/utils/logger.js';

export const maxDuration = 30;

const AcknowledgeAlertSchema = z.object({
  reason: z.string().min(1, 'Acknowledgment reason is required'),
  acknowledgedBy: z.string().optional().default('api_user')
});

/**
 * POST /api/cash-clearing/monitoring/alerts/[alertId]/acknowledge
 * Acknowledge an active alert
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { alertId: string } }
) {
  try {
    const { alertId } = params;
    const body = await request.json();
    const validatedData = AcknowledgeAlertSchema.parse(body);

    // Get current user from authentication (placeholder)
    const currentUser = getCurrentUser(request) || validatedData.acknowledgedBy;

    // Acknowledge the alert
    try {
      // @ts-ignore - monitoringSystem is a JS module with different type expectations
      monitoringSystem.acknowledgeAlert(alertId, currentUser || 'api_user', validatedData.reason);
      
      logger.info('Alert acknowledged', {
        alertId,
        acknowledgedBy: currentUser,
        reason: validatedData.reason
      });

      return NextResponse.json({
        success: true,
        message: 'Alert acknowledged successfully',
        alertId,
        acknowledgedBy: currentUser,
        acknowledgedAt: new Date().toISOString(),
        reason: validatedData.reason
      });

    } catch (alertError) {
      if (alertError instanceof Error && alertError.message.includes('Alert not found')) {
        return NextResponse.json({
          error: 'Alert not found',
          message: `Alert with ID ${alertId} does not exist or is not active`
        }, { status: 404 });
      }
      throw alertError;
    }

  } catch (error) {
    logger.error('Failed to acknowledge alert', {
      alertId: params.alertId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: 'Validation failed',
        details: error.errors
      }, { status: 400 });
    }

    return NextResponse.json({
      error: 'Failed to acknowledge alert',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * Helper function to get current user from request
 * In a real implementation, this would extract user info from JWT or session
 */
function getCurrentUser(request: NextRequest): string | null {
  // Check for API key or JWT token
  const apiKey = request.headers.get('x-api-key');
  const authHeader = request.headers.get('authorization');
  
  if (apiKey) {
    return 'api_user';
  }
  
  if (authHeader?.startsWith('Bearer ')) {
    // In a real implementation, decode JWT and extract user info
    return 'jwt_user';
  }
  
  return null;
}