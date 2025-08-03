import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCashClearingMcpClient } from '@/src/services/cashClearingMcpClient.js';
import { logger } from '@/src/utils/logger.js';
import { getUserIdOrFallback, type AuthResult, type User } from '@/lib/api-middleware';import type { TransactionQueryResult } from '@/lib/types';

export const maxDuration = 30;

// Query parameters schema
const GetApprovalsSchema = z.object({
  limit: z.coerce.number().min(1).max(1000).optional().default(100),
  offset: z.coerce.number().min(0).optional().default(0),
  batchId: z.string().optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'AUTO_APPROVED', 'ALL']).optional().default('PENDING'),
  confidenceMin: z.coerce.number().min(0).max(1).optional(),
  confidenceMax: z.coerce.number().min(0).max(1).optional(),
  amountMin: z.coerce.number().optional(),
  amountMax: z.coerce.number().optional(),
  glAccountCode: z.string().optional(),
  approvedBy: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  sortBy: z.enum(['created_at', 'confidence_score', 'amount', 'approved_at']).optional().default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  includeDetails: z.coerce.boolean().optional().default(true)
});

// Response schema
const ApprovalsResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(z.object({
    suggestion_id: z.string(),
    transaction_id: z.string(),
    batch_id: z.string().optional(),
    approval_status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'AUTO_APPROVED']),
    confidence_score: z.number(),
    amount: z.number(),
    gl_account_code: z.string().optional(),
    gl_account_name: z.string().optional(),
    debit_credit_indicator: z.enum(['DR', 'CR']).optional(),
    pattern_matched: z.string().optional(),
    approved_by: z.string().optional(),
    approved_at: z.string().optional(),
    created_at: z.string(),
    reasoning: z.record(z.any()).optional(),
    validation_checks: z.record(z.any()).optional(),
    transaction_details: z.object({
      description: z.string(),
      transaction_date: z.string(),
      account_id: z.string(),
      currency_code: z.string(),
      reference_number: z.string().optional()
    }).optional(),
    risk_score: z.number().optional(),
    business_impact: z.object({
      category: z.string(),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
      amount_impact: z.number(),
      account_impact: z.string()
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
    totalPending: z.number(),
    totalApproved: z.number(),
    totalRejected: z.number(),
    totalAutoApproved: z.number(),
    averageConfidence: z.number(),
    totalAmount: z.number(),
    highRiskCount: z.number(),
    urgentCount: z.number()
  }),
  filters: z.object({
    applied: z.record(z.any()),
    available: z.object({
      batchIds: z.array(z.string()),
      glAccounts: z.array(z.string()),
      approvers: z.array(z.string()),
      patterns: z.array(z.string())
    })
  })
});

type GetApprovalsQuery = z.infer<typeof GetApprovalsSchema>;
type ApprovalsResponse = z.infer<typeof ApprovalsResponseSchema>;

/**
 * GET /api/cash-clearing/approvals
 * Get pending approvals with filtering and pagination
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Parse and validate query parameters
    const { searchParams } = new URL(request.url);
    const queryParams = Object.fromEntries(searchParams.entries());
    const validatedQuery = GetApprovalsSchema.parse(queryParams);

    // Authentication check
    const authResult = await authenticateRequest(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Authorization check
    if (!hasApprovalReadPermission(authResult.user)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Insufficient permissions to read approvals' },
        { status: 403 }
      );
    }

    logger.debug('Fetching approvals', {
      userId: getUserIdOrFallback(authResult),
      filters: validatedQuery
    });

    // Get MCP client
    const mcpClient = getCashClearingMcpClient();

    // Build query filters
    const queryFilters = buildApprovalFilters(validatedQuery);

    // Fetch data in parallel
    const [approvals, totalCount, summary, filterOptions] = await Promise.all([
      fetchFilteredApprovals(mcpClient, validatedQuery, queryFilters),
      getApprovalCount(mcpClient, queryFilters),
      getApprovalSummary(mcpClient, queryFilters),
      getApprovalFilterOptions(mcpClient)
    ]);

    // Calculate pagination
    const totalPages = Math.ceil(totalCount / validatedQuery.limit);
    const currentPage = Math.floor(validatedQuery.offset / validatedQuery.limit) + 1;
    const hasMore = validatedQuery.offset + validatedQuery.limit < totalCount;

    // Enrich approvals with additional details
    const enrichedApprovals = await enrichApprovalsWithDetails(
      mcpClient,
      approvals,
      validatedQuery.includeDetails
    );

    const response: ApprovalsResponse = {
      success: true,
      data: enrichedApprovals,
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
          status: validatedQuery.status,
          batchId: validatedQuery.batchId,
          confidenceRange: validatedQuery.confidenceMin || validatedQuery.confidenceMax ? {
            min: validatedQuery.confidenceMin,
            max: validatedQuery.confidenceMax
          } : null,
          amountRange: validatedQuery.amountMin || validatedQuery.amountMax ? {
            min: validatedQuery.amountMin,
            max: validatedQuery.amountMax
          } : null,
          glAccountCode: validatedQuery.glAccountCode,
          approvedBy: validatedQuery.approvedBy,
          dateRange: validatedQuery.dateFrom || validatedQuery.dateTo ? {
            from: validatedQuery.dateFrom,
            to: validatedQuery.dateTo
          } : null
        },
        available: filterOptions
      }
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Processing-Time': `${Date.now() - startTime}ms`,
        'X-Total-Count': totalCount.toString()
      }
    });

  } catch (error) {
    logger.error('Failed to fetch approvals', {
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
        message: 'Failed to fetch approvals'
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
      user: { id: 'api-user', type: 'api' as const, permissions: ['approval:read'] }
    };
  }

  if (authHeader?.startsWith('Bearer ')) {
    return {
      success: true,
      user: { id: 'user-123', type: 'user' as const, permissions: ['approval:read', 'approval:manage'] }
    };
  }

  return { success: false };
}

function hasApprovalReadPermission(user: any): boolean {
  return user.permissions?.includes('approval:read') || 
         user.permissions?.includes('approval:manage') || 
         user.type === 'api';
}

function buildApprovalFilters(query: GetApprovalsQuery) {
  const filters: string[] = [];
  const params: any = {};

  // Status filter
  if (query.status !== 'ALL') {
    filters.push("s.approval_status = @status");
    params.status = query.status;
  }

  // Batch ID filter
  if (query.batchId) {
    filters.push("s.processing_batch_id = @batchId");
    params.batchId = query.batchId;
  }

  // Confidence range filter
  if (query.confidenceMin !== undefined) {
    filters.push("s.confidence_score >= @confidenceMin");
    params.confidenceMin = query.confidenceMin;
  }
  if (query.confidenceMax !== undefined) {
    filters.push("s.confidence_score <= @confidenceMax");
    params.confidenceMax = query.confidenceMax;
  }

  // Amount range filter
  if (query.amountMin !== undefined) {
    filters.push("s.amount >= @amountMin");
    params.amountMin = query.amountMin;
  }
  if (query.amountMax !== undefined) {
    filters.push("s.amount <= @amountMax");
    params.amountMax = query.amountMax;
  }

  // GL account filter
  if (query.glAccountCode) {
    filters.push("s.gl_account_code = @glAccountCode");
    params.glAccountCode = query.glAccountCode;
  }

  // Approver filter
  if (query.approvedBy) {
    filters.push("s.approved_by = @approvedBy");
    params.approvedBy = query.approvedBy;
  }

  // Date range filter
  if (query.dateFrom || query.dateTo) {
    if (query.dateFrom) {
      filters.push("DATE(s.created_at) >= @dateFrom");
      params.dateFrom = query.dateFrom;
    }
    if (query.dateTo) {
      filters.push("DATE(s.created_at) <= @dateTo");
      params.dateTo = query.dateTo;
    }
  }

  return { filters, params };
}

async function fetchFilteredApprovals(
  mcpClient: any,
  query: GetApprovalsQuery,
  queryFilters: any
) {
  const dataset = 'ksingamsetty-test.AI_POC';

  let sql = `
    SELECT 
      s.suggestion_id,
      s.transaction_id,
      s.processing_batch_id as batch_id,
      s.approval_status,
      s.confidence_score,
      s.amount,
      s.gl_account_code,
      s.gl_account_name,
      s.debit_credit_indicator,
      s.pattern_matched,
      s.approved_by,
      s.approved_at,
      s.created_at,
      s.reasoning,
      s.validation_checks
    FROM ${dataset}.ai_cash_clearing_suggestions s
  `;

  if (queryFilters.filters.length > 0) {
    sql += ` WHERE ${queryFilters.filters.join(' AND ')}`;
  }

  sql += ` ORDER BY s.${query.sortBy} ${query.sortOrder.toUpperCase()}`;
  sql += ` LIMIT ${query.limit} OFFSET ${query.offset}`;

  const results = await mcpClient.executeQueryWithRetry(sql, { logQuery: true });

  // Parse JSON fields
  return results.map((approval: any) => ({
    ...approval,
    reasoning: approval.reasoning ? JSON.parse(approval.reasoning) : null,
    validation_checks: approval.validation_checks ? JSON.parse(approval.validation_checks) : null
  }));
}

async function getApprovalCount(mcpClient: any, queryFilters: any) {
  const dataset = 'ksingamsetty-test.AI_POC';

  let sql = `SELECT COUNT(*) as total FROM ${dataset}.ai_cash_clearing_suggestions s`;
  
  if (queryFilters.filters.length > 0) {
    sql += ` WHERE ${queryFilters.filters.join(' AND ')}`;
  }

  const result = await mcpClient.executeQueryWithRetry(sql);
  return result[0]?.total || 0;
}

async function getApprovalSummary(mcpClient: any, queryFilters: any) {
  const dataset = 'ksingamsetty-test.AI_POC';

  let sql = `
    SELECT 
      COUNT(*) as total_count,
      COUNT(CASE WHEN approval_status = 'PENDING' THEN 1 END) as total_pending,
      COUNT(CASE WHEN approval_status = 'APPROVED' THEN 1 END) as total_approved,
      COUNT(CASE WHEN approval_status = 'REJECTED' THEN 1 END) as total_rejected,
      COUNT(CASE WHEN approval_status = 'AUTO_APPROVED' THEN 1 END) as total_auto_approved,
      AVG(confidence_score) as average_confidence,
      SUM(amount) as total_amount,
      COUNT(CASE WHEN confidence_score < 0.5 THEN 1 END) as high_risk_count,
      COUNT(CASE WHEN amount > 10000 THEN 1 END) as urgent_count
    FROM ${dataset}.ai_cash_clearing_suggestions s
  `;

  if (queryFilters.filters.length > 0) {
    sql += ` WHERE ${queryFilters.filters.join(' AND ')}`;
  }

  const result = await mcpClient.executeQueryWithRetry(sql);
  const summary = result[0] || {};

  return {
    totalPending: summary.total_pending || 0,
    totalApproved: summary.total_approved || 0,
    totalRejected: summary.total_rejected || 0,
    totalAutoApproved: summary.total_auto_approved || 0,
    averageConfidence: summary.average_confidence || 0,
    totalAmount: summary.total_amount || 0,
    highRiskCount: summary.high_risk_count || 0,
    urgentCount: summary.urgent_count || 0
  };
}

async function getApprovalFilterOptions(mcpClient: any) {
  const dataset = 'ksingamsetty-test.AI_POC';

  const [batchIds, glAccounts, approvers, patterns] = await Promise.all([
    mcpClient.executeQueryWithRetry(`
      SELECT DISTINCT processing_batch_id 
      FROM ${dataset}.ai_cash_clearing_suggestions 
      WHERE processing_batch_id IS NOT NULL 
      ORDER BY processing_batch_id DESC 
      LIMIT 50
    `),
    mcpClient.executeQueryWithRetry(`
      SELECT DISTINCT gl_account_code 
      FROM ${dataset}.ai_cash_clearing_suggestions 
      WHERE gl_account_code IS NOT NULL 
      ORDER BY gl_account_code
    `),
    mcpClient.executeQueryWithRetry(`
      SELECT DISTINCT approved_by 
      FROM ${dataset}.ai_cash_clearing_suggestions 
      WHERE approved_by IS NOT NULL 
      ORDER BY approved_by
    `),
    mcpClient.executeQueryWithRetry(`
      SELECT DISTINCT pattern_matched 
      FROM ${dataset}.ai_cash_clearing_suggestions 
      WHERE pattern_matched IS NOT NULL 
      ORDER BY pattern_matched
    `)
  ]);

  return {
    batchIds: batchIds.map((row: any) => row.processing_batch_id),
    glAccounts: glAccounts.map((row: any) => row.gl_account_code),
    approvers: approvers.map((row: any) => row.approved_by),
    patterns: patterns.map((row: any) => row.pattern_matched)
  };
}

async function enrichApprovalsWithDetails(
  mcpClient: any,
  approvals: any[],
  includeDetails: boolean
) {
  if (!includeDetails || approvals.length === 0) {
    return approvals.map(approval => ({
      ...approval,
      risk_score: calculateRiskScore(approval),
      business_impact: calculateBusinessImpact(approval)
    }));
  }

  const dataset = 'ksingamsetty-test.AI_POC';
  const transactionIds = approvals.map(a => `'${a.transaction_id}'`).join(',');

  // Get transaction details
  const transactionDetails = await mcpClient.executeQueryWithRetry(`
    SELECT 
      transaction_id,
      description,
      transaction_date,
      account_id,
      currency_code,
      reference_number
    FROM ${dataset}.cash_transactions
    WHERE transaction_id IN (${transactionIds})
  `);

  const transactionMap = new Map<string, TransactionQueryResult>(
    transactionDetails.map((t: TransactionQueryResult) => [t.transaction_id, t])
  );

  return approvals.map(approval => {
    const transactionDetail = transactionMap.get(approval.transaction_id);
    
    return {
      ...approval,
      transaction_details: transactionDetail ? {
        description: transactionDetail.description,
        transaction_date: transactionDetail.transaction_date,
        account_id: transactionDetail.account_id,
        currency_code: transactionDetail.currency_code,
        reference_number: transactionDetail.reference_number
      } : undefined,
      risk_score: calculateRiskScore(approval),
      business_impact: calculateBusinessImpact(approval)
    };
  });
}

function calculateRiskScore(approval: any): number {
  let riskScore = 0;

  // Low confidence increases risk
  if (approval.confidence_score < 0.5) riskScore += 0.4;
  else if (approval.confidence_score < 0.7) riskScore += 0.2;

  // High amounts increase risk
  if (approval.amount > 50000) riskScore += 0.3;
  else if (approval.amount > 10000) riskScore += 0.1;

  // Missing GL mapping increases risk
  if (!approval.gl_account_code) riskScore += 0.3;

  return Math.min(riskScore, 1.0);
}

function calculateBusinessImpact(approval: any) {
  let priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
  
  if (approval.amount > 100000) priority = 'CRITICAL';
  else if (approval.amount > 50000) priority = 'HIGH';
  else if (approval.amount > 10000) priority = 'MEDIUM';

  return {
    category: approval.gl_account_code ? 'STANDARD' : 'UNMAPPED',
    priority,
    amount_impact: approval.amount,
    account_impact: approval.gl_account_code || 'UNKNOWN'
  };
}