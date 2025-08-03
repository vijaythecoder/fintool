import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { monitoringSystem } from '@/src/utils/monitoringSystem.js';
import { logger } from '@/src/utils/logger.js';

export const maxDuration = 30;

const ResolveAlertSchema = z.object({
  resolution: z.string().min(1, 'Resolution details are required'),
  resolvedBy: z.string().optional().default('api_user')
});

/**
 * POST /api/cash-clearing/monitoring/alerts/[alertId]/resolve
 * Resolve an active or acknowledged alert
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { alertId: string } }
) {
  try {
    const { alertId } = params;
    const body = await request.json();
    const validatedData = ResolveAlertSchema.parse(body);

    // Get current user from authentication (placeholder)
    const currentUser = getCurrentUser(request) || validatedData.resolvedBy;

    // Resolve the alert
    try {
      // @ts-ignore - monitoringSystem is a JS module with different type expectations
      monitoringSystem.resolveAlert(alertId, currentUser || 'api_user', validatedData.resolution);
      
      logger.info('Alert resolved', {
        alertId,
        resolvedBy: currentUser,
        resolution: validatedData.resolution
      });

      return NextResponse.json({
        success: true,
        message: 'Alert resolved successfully',
        alertId,
        resolvedBy: currentUser,
        resolvedAt: new Date().toISOString(),
        resolution: validatedData.resolution
      });

    } catch (alertError) {
      if (alertError instanceof Error && alertError.message.includes('Alert not found')) {
        return NextResponse.json({
          error: 'Alert not found',
          message: `Alert with ID ${alertId} does not exist or is already resolved`
        }, { status: 404 });
      }
      throw alertError;
    }

  } catch (error) {
    logger.error('Failed to resolve alert', {
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
      error: 'Failed to resolve alert',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * Helper function to get current user from request
 */
function getCurrentUser(request: NextRequest): string | null {
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