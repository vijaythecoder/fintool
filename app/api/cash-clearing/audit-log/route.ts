import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCashClearingMcpClient } from '@/src/services/cashClearingMcpClient.js';
import { logger } from '@/src/utils/logger.js';
import { getUserIdOrFallback, type AuthResult, type User } from '@/lib/api-middleware';
export const maxDuration = 30;

// Query parameters schema
const AuditLogQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(1000).optional().default(100),
  offset: z.coerce.number().min(0).optional().default(0),
  workflowId: z.string().optional(),
  transactionId: z.string().optional(),
  userId: z.string().optional(),
  actionType: z.enum([
    'WORKFLOW_STARTED',
    'WORKFLOW_PAUSED',
    'WORKFLOW_RESUMED',
    'WORKFLOW_COMPLETED',
    'WORKFLOW_FAILED',
    'QUERY',
    'MATCH',
    'GL_MAPPING',
    'APPROVE',
    'REJECT',
    'BATCH_APPROVE',
    'BATCH_REJECT',
    'AUTO_PROCESS',
    'SUGGESTIONS_CREATED'
  ]).optional(),
  stepNumber: z.coerce.number().min(0).max(4).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  confidenceMin: z.coerce.number().min(0).max(1).optional(),
  confidenceMax: z.coerce.number().min(0).max(1).optional(),
  includeDetails: z.coerce.boolean().optional().default(true),
  sortBy: z.enum(['timestamp', 'step_number', 'confidence_score', 'processing_time_ms']).optional().default('timestamp'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc')
});

// Response schema
const AuditLogResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(z.object({
    audit_id: z.string(),
    workflow_id: z.string().optional(),
    transaction_id: z.string().optional(),
    step_number: z.number(),
    action_type: z.string(),
    action_details: z.record(z.any()),
    user_id: z.string().optional(),
    ai_model: z.string().optional(),
    confidence_score: z.number().optional(),
    processing_time_ms: z.number().optional(),
    input_data: z.record(z.any()).optional(),
    output_data: z.record(z.any()).optional(),
    error_details: z.record(z.any()).optional(),
    timestamp: z.string(),
    transaction_details: z.object({
      description: z.string(),
      amount: z.number(),
      account_id: z.string()
    }).optional(),
    workflow_details: z.object({
      batch_id: z.string(),
      workflow_status: z.string(),
      current_step: z.number()
    }).optional()
  })),
  pagination: z.object({
    limit: z.number(),
    offset: z.number(),
    total: z.number(),
    hasMore: z.boolean(),
    totalPages: z.number(),
    currentPage: z.number()
  }),
  summary: z.object({
    totalEntries: z.number(),
    actionTypeBreakdown: z.record(z.number()),
    stepBreakdown: z.record(z.number()),
    userBreakdown: z.record(z.number()),
    averageProcessingTime: z.number(),
    errorCount: z.number()
  }),
  filters: z.object({
    applied: z.record(z.any()),
    available: z.object({
      workflowIds: z.array(z.string()),
      users: z.array(z.string()),
      actionTypes: z.array(z.string())
    })
  })
});

type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;
type AuditLogResponse = z.infer<typeof AuditLogResponseSchema>;

/**
 * GET /api/cash-clearing/audit-log
 * Get audit log entries with filtering and pagination
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Parse and validate query parameters
    const { searchParams } = new URL(request.url);
    const queryParams = Object.fromEntries(searchParams.entries());
    const validatedQuery = AuditLogQuerySchema.parse(queryParams);

    // Authentication check
    const authResult = await authenticateRequest(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Authorization check
    if (!hasAuditReadPermission(authResult.user)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Insufficient permissions to access audit logs' },
        { status: 403 }
      );
    }

    logger.debug('Fetching audit log entries', {
      userId: getUserIdOrFallback(authResult),
      filters: validatedQuery
    });

    // Get MCP client
    const mcpClient = getCashClearingMcpClient();

    // Build query filters
    const queryFilters = buildAuditLogFilters(validatedQuery);

    // Fetch data in parallel
    const [auditEntries, totalCount, summary, filterOptions] = await Promise.all([
      fetchFilteredAuditEntries(mcpClient, validatedQuery, queryFilters),
      getAuditLogCount(mcpClient, queryFilters),
      getAuditLogSummary(mcpClient, queryFilters),
      getAuditLogFilterOptions(mcpClient)
    ]);

    // Calculate pagination
    const totalPages = Math.ceil(totalCount / validatedQuery.limit);
    const currentPage = Math.floor(validatedQuery.offset / validatedQuery.limit) + 1;
    const hasMore = validatedQuery.offset + validatedQuery.limit < totalCount;

    // Enrich audit entries with additional details if requested
    const enrichedEntries = validatedQuery.includeDetails
      ? await enrichAuditEntriesWithDetails(mcpClient, auditEntries)
      : auditEntries;

    const response: AuditLogResponse = {
      success: true,
      data: enrichedEntries,
      pagination: {
        limit: validatedQuery.limit,
        offset: validatedQuery.offset,
        total: totalCount,
        hasMore,
        totalPages,
        currentPage
      },
      summary,
      filters: {
        applied: {
          workflowId: validatedQuery.workflowId,
          transactionId: validatedQuery.transactionId,
          userId: validatedQuery.userId,
          actionType: validatedQuery.actionType,
          stepNumber: validatedQuery.stepNumber,
          dateRange: validatedQuery.dateFrom || validatedQuery.dateTo ? {
            from: validatedQuery.dateFrom,
            to: validatedQuery.dateTo
          } : null,
          confidenceRange: validatedQuery.confidenceMin || validatedQuery.confidenceMax ? {
            min: validatedQuery.confidenceMin,
            max: validatedQuery.confidenceMax
          } : null
        },
        available: filterOptions
      }
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'private, max-age=60', // Cache for 1 minute
        'X-Processing-Time': `${Date.now() - startTime}ms`,
        'X-Total-Count': totalCount.toString()
      }
    });

  } catch (error) {
    logger.error('Failed to fetch audit log', {
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTimeMs: Date.now() - startTime
    });

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          message: 'Invalid query parameters',
          details: error.errors
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to fetch audit log'
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
      user: { id: 'api-user', type: 'api' as const, permissions: ['audit:read'] }
    };
  }

  if (authHeader?.startsWith('Bearer ')) {
    return {
      success: true,
      user: { id: 'user-123', type: 'user' as const, permissions: ['audit:read'] }
    };
  }

  return { success: false };
}

function hasAuditReadPermission(user: any): boolean {
  return user.permissions?.includes('audit:read') || user.type === 'api';
}

function buildAuditLogFilters(query: AuditLogQuery) {
  const filters: string[] = [];
  const params: any = {};

  // Workflow ID filter
  if (query.workflowId) {
    filters.push("workflow_id = @workflowId");
    params.workflowId = query.workflowId;
  }

  // Transaction ID filter
  if (query.transactionId) {
    filters.push("transaction_id = @transactionId");
    params.transactionId = query.transactionId;
  }

  // User ID filter
  if (query.userId) {
    filters.push("user_id = @userId");
    params.userId = query.userId;
  }

  // Action type filter
  if (query.actionType) {
    filters.push("action_type = @actionType");
    params.actionType = query.actionType;
  }

  // Step number filter
  if (query.stepNumber !== undefined) {
    filters.push("step_number = @stepNumber");
    params.stepNumber = query.stepNumber;
  }

  // Date range filter
  if (query.dateFrom || query.dateTo) {
    if (query.dateFrom) {
      filters.push("DATE(timestamp) >= @dateFrom");
      params.dateFrom = query.dateFrom;
    }
    if (query.dateTo) {
      filters.push("DATE(timestamp) <= @dateTo");
      params.dateTo = query.dateTo;
    }
  }

  // Confidence range filter
  if (query.confidenceMin !== undefined) {
    filters.push("confidence_score >= @confidenceMin");
    params.confidenceMin = query.confidenceMin;
  }
  if (query.confidenceMax !== undefined) {
    filters.push("confidence_score <= @confidenceMax");
    params.confidenceMax = query.confidenceMax;
  }

  return { filters, params };
}

async function fetchFilteredAuditEntries(
  mcpClient: any,
  query: AuditLogQuery,
  queryFilters: any
) {
  const dataset = 'ksingamsetty-test.AI_POC';

  let sql = `
    SELECT 
      audit_id,
      workflow_id,
      transaction_id,
      step_number,
      action_type,
      action_details,
      user_id,
      ai_model,
      confidence_score,
      processing_time_ms,
      input_data,
      output_data,
      error_details,
      timestamp
    FROM ${dataset}.cash_clearing_audit_log
  `;

  if (queryFilters.filters.length > 0) {
    sql += ` WHERE ${queryFilters.filters.join(' AND ')}`;
  }

  sql += ` ORDER BY ${query.sortBy} ${query.sortOrder.toUpperCase()}`;
  sql += ` LIMIT ${query.limit} OFFSET ${query.offset}`;

  const results = await mcpClient.executeQueryWithRetry(sql, { logQuery: true });

  // Parse JSON fields
  return results.map((entry: any) => ({
    ...entry,
    action_details: entry.action_details ? JSON.parse(entry.action_details) : {},
    input_data: entry.input_data ? JSON.parse(entry.input_data) : undefined,
    output_data: entry.output_data ? JSON.parse(entry.output_data) : undefined,
    error_details: entry.error_details ? JSON.parse(entry.error_details) : undefined
  }));
}

async function getAuditLogCount(mcpClient: any, queryFilters: any) {
  const dataset = 'ksingamsetty-test.AI_POC';

  let sql = `SELECT COUNT(*) as total FROM ${dataset}.cash_clearing_audit_log`;
  
  if (queryFilters.filters.length > 0) {
    sql += ` WHERE ${queryFilters.filters.join(' AND ')}`;
  }

  const result = await mcpClient.executeQueryWithRetry(sql);
  return result[0]?.total || 0;
}

async function getAuditLogSummary(mcpClient: any, queryFilters: any) {
  const dataset = 'ksingamsetty-test.AI_POC';

  let sql = `
    SELECT 
      COUNT(*) as total_entries,
      action_type,
      step_number,
      user_id,
      AVG(processing_time_ms) as avg_processing_time,
      COUNT(CASE WHEN error_details IS NOT NULL THEN 1 END) as error_count
    FROM ${dataset}.cash_clearing_audit_log
  `;

  if (queryFilters.filters.length > 0) {
    sql += ` WHERE ${queryFilters.filters.join(' AND ')}`;
  }

  sql += ` GROUP BY action_type, step_number, user_id`;

  const results = await mcpClient.executeQueryWithRetry(sql);

  // Process results into summary format
  const actionTypeBreakdown: Record<string, number> = {};
  const stepBreakdown: Record<string, number> = {};
  const userBreakdown: Record<string, number> = {};
  let totalEntries = 0;
  let totalProcessingTime = 0;
  let errorCount = 0;

  results.forEach((row: any) => {
    actionTypeBreakdown[row.action_type] = (actionTypeBreakdown[row.action_type] || 0) + 1;
    stepBreakdown[row.step_number] = (stepBreakdown[row.step_number] || 0) + 1;
    if (row.user_id) {
      userBreakdown[row.user_id] = (userBreakdown[row.user_id] || 0) + 1;
    }
    totalEntries += 1;
    totalProcessingTime += row.avg_processing_time || 0;
    errorCount += row.error_count || 0;
  });

  return {
    totalEntries,
    actionTypeBreakdown,
    stepBreakdown,
    userBreakdown,
    averageProcessingTime: totalEntries > 0 ? totalProcessingTime / totalEntries : 0,
    errorCount
  };
}

async function getAuditLogFilterOptions(mcpClient: any) {
  const dataset = 'ksingamsetty-test.AI_POC';

  const [workflowIds, users, actionTypes] = await Promise.all([
    mcpClient.executeQueryWithRetry(`
      SELECT DISTINCT workflow_id 
      FROM ${dataset}.cash_clearing_audit_log 
      WHERE workflow_id IS NOT NULL 
      ORDER BY workflow_id DESC 
      LIMIT 50
    `),
    mcpClient.executeQueryWithRetry(`
      SELECT DISTINCT user_id 
      FROM ${dataset}.cash_clearing_audit_log 
      WHERE user_id IS NOT NULL 
      ORDER BY user_id
    `),
    mcpClient.executeQueryWithRetry(`
      SELECT DISTINCT action_type 
      FROM ${dataset}.cash_clearing_audit_log 
      ORDER BY action_type
    `)
  ]);

  return {
    workflowIds: workflowIds.map((row: any) => row.workflow_id),
    users: users.map((row: any) => row.user_id),
    actionTypes: actionTypes.map((row: any) => row.action_type)
  };
}

async function enrichAuditEntriesWithDetails(
  mcpClient: any,
  auditEntries: any[]
) {
  if (auditEntries.length === 0) return auditEntries;

  const dataset = 'ksingamsetty-test.AI_POC';
  
  // Get unique transaction and workflow IDs
  const transactionIds = [...new Set(auditEntries
    .filter(e => e.transaction_id)
    .map(e => e.transaction_id))];
  
  const workflowIds = [...new Set(auditEntries
    .filter(e => e.workflow_id)
    .map(e => e.workflow_id))];

  // Fetch transaction details
  let transactionDetails = [];
  if (transactionIds.length > 0) {
    const transactionIdsList = transactionIds.map(id => `'${id}'`).join(',');
    transactionDetails = await mcpClient.executeQueryWithRetry(`
      SELECT transaction_id, description, amount, account_id
      FROM ${dataset}.cash_transactions
      WHERE transaction_id IN (${transactionIdsList})
    `);
  }

  // Fetch workflow details
  let workflowDetails = [];
  if (workflowIds.length > 0) {
    const workflowIdsList = workflowIds.map(id => `'${id}'`).join(',');
    workflowDetails = await mcpClient.executeQueryWithRetry(`
      SELECT workflow_id, batch_id, workflow_status, current_step
      FROM ${dataset}.cash_clearing_workflow_state
      WHERE workflow_id IN (${workflowIdsList})
    `);
  }

  // Create lookup maps
  const transactionMap = new Map(
    transactionDetails.map((t: any) => [t.transaction_id, t])
  );
  const workflowMap = new Map(
    workflowDetails.map((w: any) => [w.workflow_id, w])
  );

  // Enrich audit entries
  return auditEntries.map(entry => ({
    ...entry,
    transaction_details: entry.transaction_id 
      ? transactionMap.get(entry.transaction_id) 
      : undefined,
    workflow_details: entry.workflow_id 
      ? workflowMap.get(entry.workflow_id) 
      : undefined
  }));
}