import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCashClearingMcpClient } from '@/src/services/cashClearingMcpClient.js';
import { logger } from '@/src/utils/logger.js';
import { getUserIdOrFallback, type AuthResult, type User } from '@/lib/api-middleware';
export const maxDuration = 30;

// Query parameters schema
const GetTransactionsSchema = z.object({
  limit: z.coerce.number().min(1).max(1000).optional().default(100),
  offset: z.coerce.number().min(0).optional().default(0),
  status: z.enum(['unprocessed', 'processed', 'failed', 'all']).optional().default('unprocessed'),
  pattern: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  amountMin: z.coerce.number().optional(),
  amountMax: z.coerce.number().optional(),
  accountId: z.string().optional(),
  currencyCode: z.string().optional(),
  sortBy: z.enum(['transaction_date', 'amount', 'created_at']).optional().default('transaction_date'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  includeMetadata: z.coerce.boolean().optional().default(false)
});

// Response schema
const TransactionsResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(z.object({
    transaction_id: z.string(),
    amount: z.number(),
    reference_number: z.string().optional(),
    description: z.string(),
    transaction_date: z.string(),
    account_id: z.string(),
    currency_code: z.string(),
    pattern: z.string(),
    source_system: z.string(),
    batch_id: z.string().optional(),
    created_at: z.string(),
    updated_at: z.string().optional(),
    processing_status: z.string().optional(),
    match_confidence: z.number().optional(),
    suggestions_count: z.number().optional(),
    latest_suggestion: z.object({
      suggestion_id: z.string(),
      approval_status: z.string(),
      confidence_score: z.number(),
      gl_account_code: z.string().optional(),
      created_at: z.string()
    }).optional(),
    metadata: z.record(z.any()).optional()
  })),
  pagination: z.object({
    limit: z.number(),
    offset: z.number(),
    total: z.number(),
    hasMore: z.boolean(),
    totalPages: z.number(),
    currentPage: z.number()
  }),
  filters: z.object({
    applied: z.record(z.any()),
    available: z.object({
      patterns: z.array(z.string()),
      accounts: z.array(z.string()),
      currencies: z.array(z.string()),
      sourceSystems: z.array(z.string())
    })
  }),
  summary: z.object({
    totalAmount: z.number(),
    transactionCount: z.number(),
    averageAmount: z.number(),
    statusBreakdown: z.record(z.number()),
    currencyBreakdown: z.record(z.number())
  })
});

type GetTransactionsQuery = z.infer<typeof GetTransactionsSchema>;
type TransactionsResponse = z.infer<typeof TransactionsResponseSchema>;

/**
 * GET /api/cash-clearing/transactions
 * Get unprocessed transactions with filtering and pagination
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Parse and validate query parameters
    const { searchParams } = new URL(request.url);
    const queryParams = Object.fromEntries(searchParams.entries());
    const validatedQuery = GetTransactionsSchema.parse(queryParams);

    // Authentication check
    const authResult = await authenticateRequest(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Authorization check - ensure user has read permissions
    if (!hasReadPermission(authResult.user)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Insufficient permissions to read transactions' },
        { status: 403 }
      );
    }

    logger.debug('Fetching transactions', {
      userId: getUserIdOrFallback(authResult),
      filters: validatedQuery
    });

    // Get MCP client
    const mcpClient = getCashClearingMcpClient();

    // Build query based on filters
    const queryFilters = buildTransactionFilters(validatedQuery);
    
    // Fetch transactions with parallel requests for efficiency
    const [transactions, totalCount, summary, filterOptions] = await Promise.all([
      fetchFilteredTransactions(mcpClient, validatedQuery, queryFilters),
      getTransactionCount(mcpClient, queryFilters),
      getTransactionSummary(mcpClient, queryFilters),
      getFilterOptions(mcpClient)
    ]);

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / validatedQuery.limit);
    const currentPage = Math.floor(validatedQuery.offset / validatedQuery.limit) + 1;
    const hasMore = validatedQuery.offset + validatedQuery.limit < totalCount;

    // Enrich transactions with suggestions data if requested
    const enrichedTransactions = await enrichTransactionsWithSuggestions(
      mcpClient,
      transactions,
      validatedQuery.includeMetadata
    );

    const response: TransactionsResponse = {
      success: true,
      data: enrichedTransactions,
      pagination: {
        limit: validatedQuery.limit,
        offset: validatedQuery.offset,
        total: totalCount,
        hasMore,
        totalPages,
        currentPage
      },
      filters: {
        applied: {
          status: validatedQuery.status,
          pattern: validatedQuery.pattern,
          dateRange: validatedQuery.dateFrom || validatedQuery.dateTo ? {
            from: validatedQuery.dateFrom,
            to: validatedQuery.dateTo
          } : null,
          amountRange: validatedQuery.amountMin || validatedQuery.amountMax ? {
            min: validatedQuery.amountMin,
            max: validatedQuery.amountMax
          } : null,
          accountId: validatedQuery.accountId,
          currencyCode: validatedQuery.currencyCode
        },
        available: filterOptions
      },
      summary
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Processing-Time': `${Date.now() - startTime}ms`,
        'X-Total-Count': totalCount.toString()
      }
    });

  } catch (error) {
    logger.error('Failed to fetch transactions', {
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
        message: 'Failed to fetch transactions'
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
      user: { id: 'api-user', type: 'api' as const, permissions: ['transaction:read'] }
    };
  }

  if (authHeader?.startsWith('Bearer ')) {
    return {
      success: true,
      user: { id: 'user-123', type: 'user' as const, permissions: ['transaction:read'] }
    };
  }

  return { success: false };
}

function hasReadPermission(user: any): boolean {
  return user.permissions?.includes('transaction:read') || user.type === 'api';
}

function buildTransactionFilters(query: GetTransactionsQuery) {
  const filters: string[] = [];
  const params: any = {};

  // Status filter
  if (query.status === 'unprocessed') {
    filters.push("pattern = 'T_NOTFOUND'");
  } else if (query.status === 'processed') {
    filters.push("pattern != 'T_NOTFOUND'");
  } else if (query.status === 'failed') {
    filters.push("processing_status = 'FAILED'");
  }

  // Pattern filter
  if (query.pattern) {
    filters.push("pattern = @pattern");
    params.pattern = query.pattern;
  }

  // Date range filter
  if (query.dateFrom || query.dateTo) {
    if (query.dateFrom) {
      filters.push("DATE(transaction_date) >= @dateFrom");
      params.dateFrom = query.dateFrom;
    }
    if (query.dateTo) {
      filters.push("DATE(transaction_date) <= @dateTo");
      params.dateTo = query.dateTo;
    }
  }

  // Amount range filter
  if (query.amountMin !== undefined) {
    filters.push("amount >= @amountMin");
    params.amountMin = query.amountMin;
  }
  if (query.amountMax !== undefined) {
    filters.push("amount <= @amountMax");
    params.amountMax = query.amountMax;
  }

  // Account filter
  if (query.accountId) {
    filters.push("account_id = @accountId");
    params.accountId = query.accountId;
  }

  // Currency filter
  if (query.currencyCode) {
    filters.push("currency_code = @currencyCode");
    params.currencyCode = query.currencyCode;
  }

  return { filters, params };
}

async function fetchFilteredTransactions(
  mcpClient: any,
  query: GetTransactionsQuery,
  queryFilters: any
) {
  const dataset = 'ksingamsetty-test.AI_POC'; // This should come from config

  let sql = `
    SELECT 
      transaction_id,
      amount,
      reference_number,
      description,
      transaction_date,
      account_id,
      currency_code,
      pattern,
      source_system,
      batch_id,
      created_at,
      updated_at,
      processing_status
    FROM ${dataset}.cash_transactions
  `;

  if (queryFilters.filters.length > 0) {
    sql += ` WHERE ${queryFilters.filters.join(' AND ')}`;
  }

  sql += ` ORDER BY ${query.sortBy} ${query.sortOrder.toUpperCase()}`;
  sql += ` LIMIT ${query.limit} OFFSET ${query.offset}`;

  return await mcpClient.executeQueryWithRetry(sql, { logQuery: true });
}

async function getTransactionCount(mcpClient: any, queryFilters: any) {
  const dataset = 'ksingamsetty-test.AI_POC';

  let sql = `SELECT COUNT(*) as total FROM ${dataset}.cash_transactions`;
  
  if (queryFilters.filters.length > 0) {
    sql += ` WHERE ${queryFilters.filters.join(' AND ')}`;
  }

  const result = await mcpClient.executeQueryWithRetry(sql);
  return result[0]?.total || 0;
}

async function getTransactionSummary(mcpClient: any, queryFilters: any) {
  const dataset = 'ksingamsetty-test.AI_POC';

  let sql = `
    SELECT 
      COUNT(*) as transactionCount,
      SUM(amount) as totalAmount,
      AVG(amount) as averageAmount,
      pattern,
      currency_code,
      COUNT(*) as count
    FROM ${dataset}.cash_transactions
  `;

  if (queryFilters.filters.length > 0) {
    sql += ` WHERE ${queryFilters.filters.join(' AND ')}`;
  }

  sql += ` GROUP BY pattern, currency_code`;

  const results = await mcpClient.executeQueryWithRetry(sql);
  
  // Process results into summary format
  const totalAmount = results.reduce((sum: number, row: any) => sum + (row.totalAmount || 0), 0);
  const transactionCount = results.reduce((sum: number, row: any) => sum + (row.count || 0), 0);
  const averageAmount = transactionCount > 0 ? totalAmount / transactionCount : 0;

  const statusBreakdown: Record<string, number> = {};
  const currencyBreakdown: Record<string, number> = {};

  results.forEach((row: any) => {
    statusBreakdown[row.pattern] = (statusBreakdown[row.pattern] || 0) + row.count;
    currencyBreakdown[row.currency_code] = (currencyBreakdown[row.currency_code] || 0) + row.count;
  });

  return {
    totalAmount,
    transactionCount,
    averageAmount,
    statusBreakdown,
    currencyBreakdown
  };
}

async function getFilterOptions(mcpClient: any) {
  const dataset = 'ksingamsetty-test.AI_POC';

  const [patterns, accounts, currencies, sourceSystems] = await Promise.all([
    mcpClient.executeQueryWithRetry(`SELECT DISTINCT pattern FROM ${dataset}.cash_transactions ORDER BY pattern`),
    mcpClient.executeQueryWithRetry(`SELECT DISTINCT account_id FROM ${dataset}.cash_transactions ORDER BY account_id`),
    mcpClient.executeQueryWithRetry(`SELECT DISTINCT currency_code FROM ${dataset}.cash_transactions ORDER BY currency_code`),
    mcpClient.executeQueryWithRetry(`SELECT DISTINCT source_system FROM ${dataset}.cash_transactions ORDER BY source_system`)
  ]);

  return {
    patterns: patterns.map((row: any) => row.pattern),
    accounts: accounts.map((row: any) => row.account_id),
    currencies: currencies.map((row: any) => row.currency_code),
    sourceSystems: sourceSystems.map((row: any) => row.source_system)
  };
}

async function enrichTransactionsWithSuggestions(
  mcpClient: any,
  transactions: any[],
  includeMetadata: boolean
) {
  if (transactions.length === 0) return transactions;

  const dataset = 'ksingamsetty-test.AI_POC';
  const transactionIds = transactions.map(t => `'${t.transaction_id}'`).join(',');

  // Get suggestions count and latest suggestion for each transaction
  const suggestionsQuery = `
    SELECT 
      transaction_id,
      COUNT(*) as suggestions_count,
      ARRAY_AGG(
        STRUCT(
          suggestion_id,
          approval_status,
          confidence_score,
          gl_account_code,
          created_at
        ) 
        ORDER BY created_at DESC 
        LIMIT 1
      )[OFFSET(0)] as latest_suggestion
    FROM ${dataset}.ai_cash_clearing_suggestions
    WHERE transaction_id IN (${transactionIds})
    GROUP BY transaction_id
  `;

  const suggestions = await mcpClient.executeQueryWithRetry(suggestionsQuery);
  const suggestionMap = new Map(suggestions.map((s: any) => [s.transaction_id, s]));

  return transactions.map(transaction => {
    const suggestion: any = suggestionMap.get(transaction.transaction_id);
    
    return {
      ...transaction,
      suggestions_count: suggestion?.suggestions_count || 0,
      latest_suggestion: suggestion?.latest_suggestion || null,
      processing_status: transaction.processing_status || 'unprocessed',
      match_confidence: suggestion?.latest_suggestion?.confidence_score || null,
      metadata: includeMetadata ? transaction.metadata || {} : undefined
    };
  });
}