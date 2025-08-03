import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { monitoringSystem } from '@/src/utils/monitoringSystem.js';
import { logger } from '@/src/utils/logger.js';

export const maxDuration = 30;

const AlertQuerySchema = z.object({
  workflowId: z.string().optional(),
  batchId: z.string().optional(),
  status: z.enum(['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'all']).optional().default('all'),
  severity: z.enum(['1', '2', '3', '4', '5', 'all']).optional().default('all'),
  timeWindow: z.string().transform(val => parseInt(val)).optional().default('86400000'), // 24 hours
  limit: z.string().transform(val => parseInt(val)).optional().default('100'),
  offset: z.string().transform(val => parseInt(val)).optional().default('0')
});

const CreateAlertSchema = z.object({
  type: z.string(),
  severity: z.object({
    level: z.number().min(1).max(5),
    color: z.string(),
    escalation: z.string()
  }),
  metric: z.string(),
  value: z.number(),
  threshold: z.number(),
  message: z.string(),
  tags: z.record(z.any()).optional().default({}),
  workflowId: z.string().optional(),
  batchId: z.string().optional()
});

/**
 * GET /api/cash-clearing/monitoring/alerts
 * Get alerts with filtering and pagination
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const validatedParams = AlertQuerySchema.parse(params);

    // Get base alerts
    let alerts = monitoringSystem.getActiveAlerts();
    
    // Include historical alerts for broader time window
    if (validatedParams.timeWindow > 3600000) { // More than 1 hour
      const historicalAlerts = monitoringSystem.getAlertHistory(validatedParams.timeWindow);
      alerts = [...alerts, ...historicalAlerts];
    }

    // Apply filters
    let filteredAlerts = alerts;

    // Filter by status
    if (validatedParams.status !== 'all') {
      filteredAlerts = filteredAlerts.filter(alert => alert.status === validatedParams.status);
    }

    // Filter by severity
    if (validatedParams.severity !== 'all') {
      const severityLevel = parseInt(validatedParams.severity);
      filteredAlerts = filteredAlerts.filter(alert => alert.severity.level === severityLevel);
    }

    // Filter by workflow/batch ID
    if (validatedParams.workflowId) {
      filteredAlerts = filteredAlerts.filter(alert => 
        alert.tags?.workflowId === validatedParams.workflowId
      );
    }

    if (validatedParams.batchId) {
      filteredAlerts = filteredAlerts.filter(alert => 
        alert.tags?.batchId === validatedParams.batchId
      );
    }

    // Sort by severity and timestamp
    filteredAlerts.sort((a, b) => {
      if (a.severity.level !== b.severity.level) {
        return a.severity.level - b.severity.level; // Higher severity first
      }
      return b.timestamp - a.timestamp; // Newer first
    });

    // Apply pagination
    const total = filteredAlerts.length;
    const paginatedAlerts = filteredAlerts.slice(
      validatedParams.offset,
      validatedParams.offset + validatedParams.limit
    );

    // Calculate summary statistics
    const summary = {
      total,
      active: alerts.filter(a => a.status === 'ACTIVE').length,
      acknowledged: alerts.filter(a => a.status === 'ACKNOWLEDGED').length,
      resolved: alerts.filter(a => a.status === 'RESOLVED').length,
      bySeverity: {
        critical: alerts.filter(a => a.severity.level === 1).length,
        high: alerts.filter(a => a.severity.level === 2).length,
        medium: alerts.filter(a => a.severity.level === 3).length,
        low: alerts.filter(a => a.severity.level === 4).length,
        info: alerts.filter(a => a.severity.level === 5).length
      }
    };

    return NextResponse.json({
      alerts: paginatedAlerts,
      summary,
      pagination: {
        total,
        limit: validatedParams.limit,
        offset: validatedParams.offset,
        hasMore: validatedParams.offset + validatedParams.limit < total
      },
      filters: {
        status: validatedParams.status,
        severity: validatedParams.severity,
        workflowId: validatedParams.workflowId,
        batchId: validatedParams.batchId,
        timeWindow: validatedParams.timeWindow
      }
    });

  } catch (error) {
    logger.error('Failed to fetch alerts', { error: error instanceof Error ? error.message : 'Unknown error' });
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: 'Validation failed',
        details: error.errors
      }, { status: 400 });
    }

    return NextResponse.json({
      error: 'Failed to fetch alerts',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * POST /api/cash-clearing/monitoring/alerts
 * Create a new alert
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = CreateAlertSchema.parse(body);

    // Create alert object
    const alert = {
      id: generateAlertId(),
      type: validatedData.type,
      severity: validatedData.severity,
      metric: validatedData.metric,
      value: validatedData.value,
      threshold: validatedData.threshold,
      message: validatedData.message,
      timestamp: Date.now(),
      tags: {
        ...validatedData.tags,
        ...(validatedData.workflowId && { workflowId: validatedData.workflowId }),
        ...(validatedData.batchId && { batchId: validatedData.batchId }),
        source: 'api_created'
      },
      status: 'ACTIVE',
      acknowledgedBy: null,
      acknowledgedAt: null,
      resolvedAt: null
    };

    // Store alert (in a real implementation, this would persist to database)
    // For now, we'll emit it to the monitoring system
    monitoringSystem.emit('alert:triggered', alert);

    logger.info('Alert created via API', {
      alertId: alert.id,
      type: alert.type,
      severity: alert.severity.level,
      metric: alert.metric
    });

    return NextResponse.json({
      success: true,
      alert,
      message: 'Alert created successfully'
    }, { status: 201 });

  } catch (error) {
    logger.error('Failed to create alert', { error: error instanceof Error ? error.message : 'Unknown error' });
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: 'Validation failed',
        details: error.errors
      }, { status: 400 });
    }

    return NextResponse.json({
      error: 'Failed to create alert',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * Helper function to generate alert ID
 */
function generateAlertId(): string {
  return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}