import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCashClearingMcpClient } from '@/src/services/cashClearingMcpClient.js';
import { logger } from '@/src/utils/logger.js';
import { getUserIdOrFallback, type AuthResult, type User } from '@/lib/api-middleware';
export const maxDuration = 30;

// Response schema
const TransactionDetailsResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    transaction: z.object({
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
      original_data: z.record(z.any()).optional(),
      metadata: z.record(z.any()).optional()
    }),
    suggestions: z.array(z.object({
      suggestion_id: z.string(),
      workflow_step: z.number(),
      pattern_matched: z.string().optional(),
      gl_account_code: z.string().optional(),
      gl_account_name: z.string().optional(),
      debit_credit_indicator: z.enum(['DR', 'CR']).optional(),
      confidence_score: z.number(),
      approval_status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'AUTO_APPROVED']),
      approved_by: z.string().optional(),
      approved_at: z.string().optional(),
      processing_batch_id: z.string().optional(),
      ai_model: z.string().optional(),
      processing_time_ms: z.number().optional(),
      reasoning: z.record(z.any()).optional(),
      validation_checks: z.record(z.any()).optional(),
      created_at: z.string()
    })),
    patterns: z.array(z.object({
      pattern_id: z.string(),
      pattern_name: z.string(),
      pattern_type: z.string(),
      confidence_weight: z.number(),
      match_details: z.object({
        match_strength: z.number(),
        match_type: z.string(),
        matched_fields: z.array(z.string())
      }).optional()
    })),
    glMappings: z.array(z.object({
      gl_pattern_id: z.string(),
      gl_account_code: z.string(),
      gl_account_name: z.string(),
      debit_credit_indicator: z.enum(['DR', 'CR']),
      account_category: z.string(),
      mapping_confidence: z.number(),
      business_unit: z.string().optional(),
      cost_center: z.string().optional()
    })),
    auditLog: z.array(z.object({
      audit_id: z.string(),
      step_number: z.number(),
      action_type: z.string(),
      action_details: z.record(z.any()),
      user_id: z.string().optional(),
      ai_model: z.string().optional(),
      confidence_score: z.number().optional(),
      processing_time_ms: z.number().optional(),
      timestamp: z.string()
    })),
    relatedTransactions: z.array(z.object({
      transaction_id: z.string(),
      amount: z.number(),
      description: z.string(),
      transaction_date: z.string(),
      similarity_score: z.number(),
      relationship_type: z.string()
    })).optional()
  })
});

type TransactionDetailsResponse = z.infer<typeof TransactionDetailsResponseSchema>;

/**
 * GET /api/cash-clearing/transactions/[transactionId]
 * Get detailed information about a specific transaction
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { transactionId: string } }
) {
  const startTime = Date.now();

  try {
    const { transactionId } = params;

    if (!transactionId) {
      return NextResponse.json(
        { error: 'Missing transactionId parameter' },
        { status: 400 }
      );
    }

    // Authentication check
    const authResult = await authenticateRequest(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Authorization check
    if (!hasReadPermission(authResult.user)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Insufficient permissions to read transaction details' },
        { status: 403 }
      );
    }

    logger.debug('Fetching transaction details', {
      transactionId,
      userId: getUserIdOrFallback(authResult)
    });

    // Get MCP client
    const mcpClient = getCashClearingMcpClient();

    // Fetch all related data in parallel
    const [
      transaction,
      suggestions,
      patterns,
      glMappings,
      auditLog,
      relatedTransactions
    ] = await Promise.all([
      getTransactionDetails(mcpClient, transactionId),
      getTransactionSuggestions(mcpClient, transactionId),
      getMatchedPatterns(mcpClient, transactionId),
      getGLMappings(mcpClient, transactionId),
      getAuditLog(mcpClient, transactionId),
      getRelatedTransactions(mcpClient, transactionId)
    ]);

    if (!transaction) {
      return NextResponse.json(
        {
          error: 'Transaction not found',
          message: `No transaction found with ID: ${transactionId}`
        },
        { status: 404 }
      );
    }

    const response: TransactionDetailsResponse = {
      success: true,
      data: {
        transaction,
        suggestions: suggestions || [],
        patterns: patterns || [],
        glMappings: glMappings || [],
        auditLog: auditLog || [],
        relatedTransactions: relatedTransactions || []
      }
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'private, max-age=300', // Cache for 5 minutes
        'X-Processing-Time': `${Date.now() - startTime}ms`
      }
    });

  } catch (error) {
    logger.error('Failed to fetch transaction details', {
      error: error instanceof Error ? error.message : 'Unknown error',
      transactionId: params.transactionId,
      processingTimeMs: Date.now() - startTime
    });

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to fetch transaction details'
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

async function getTransactionDetails(mcpClient: any, transactionId: string) {
  const dataset = 'ksingamsetty-test.AI_POC';
  
  const query = `
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
      original_data,
      metadata
    FROM ${dataset}.cash_transactions
    WHERE transaction_id = '${transactionId}'
  `;

  const results = await mcpClient.executeQueryWithRetry(query);
  return results[0] || null;
}

async function getTransactionSuggestions(mcpClient: any, transactionId: string) {
  const dataset = 'ksingamsetty-test.AI_POC';
  
  const query = `
    SELECT 
      suggestion_id,
      workflow_step,
      pattern_matched,
      gl_account_code,
      gl_account_name,
      debit_credit_indicator,
      confidence_score,
      approval_status,
      approved_by,
      approved_at,
      processing_batch_id,
      ai_model,
      processing_time_ms,
      reasoning,
      validation_checks,
      created_at
    FROM ${dataset}.ai_cash_clearing_suggestions
    WHERE transaction_id = '${transactionId}'
    ORDER BY created_at DESC
  `;

  const results = await mcpClient.executeQueryWithRetry(query);
  
  // Parse JSON fields
  return results.map((suggestion: any) => ({
    ...suggestion,
    reasoning: suggestion.reasoning ? JSON.parse(suggestion.reasoning) : null,
    validation_checks: suggestion.validation_checks ? JSON.parse(suggestion.validation_checks) : null
  }));
}

async function getMatchedPatterns(mcpClient: any, transactionId: string) {
  const dataset = 'ksingamsetty-test.AI_POC';
  
  // Get patterns that have been matched to this transaction
  const query = `
    SELECT DISTINCT
      p.pattern_id,
      p.pattern_name,
      p.pattern_type,
      p.confidence_weight,
      s.confidence_score as match_strength
    FROM ${dataset}.cash_processor_patterns p
    JOIN ${dataset}.ai_cash_clearing_suggestions s 
      ON p.pattern_name = s.pattern_matched
    WHERE s.transaction_id = '${transactionId}'
      AND p.is_active = true
    ORDER BY s.confidence_score DESC
  `;

  const results = await mcpClient.executeQueryWithRetry(query);
  
  return results.map((pattern: any) => ({
    ...pattern,
    match_details: {
      match_strength: pattern.match_strength,
      match_type: 'ai_pattern_match',
      matched_fields: ['description', 'amount'] // This would come from actual matching logic
    }
  }));
}

async function getGLMappings(mcpClient: any, transactionId: string) {
  const dataset = 'ksingamsetty-test.AI_POC';
  
  const query = `
    SELECT DISTINCT
      gl.gl_pattern_id,
      gl.gl_account_code,
      gl.gl_account_name,
      gl.debit_credit_indicator,
      gl.account_category,
      gl.mapping_confidence,
      gl.business_unit,
      gl.cost_center
    FROM ${dataset}.cash_gl_patterns gl
    JOIN ${dataset}.ai_cash_clearing_suggestions s 
      ON gl.gl_account_code = s.gl_account_code
    WHERE s.transaction_id = '${transactionId}'
    ORDER BY gl.mapping_confidence DESC
  `;

  return await mcpClient.executeQueryWithRetry(query);
}

async function getAuditLog(mcpClient: any, transactionId: string) {
  const dataset = 'ksingamsetty-test.AI_POC';
  
  const query = `
    SELECT 
      audit_id,
      step_number,
      action_type,
      action_details,
      user_id,
      ai_model,
      confidence_score,
      processing_time_ms,
      timestamp
    FROM ${dataset}.cash_clearing_audit_log
    WHERE transaction_id = '${transactionId}'
    ORDER BY timestamp DESC
  `;

  const results = await mcpClient.executeQueryWithRetry(query);
  
  // Parse JSON fields
  return results.map((log: any) => ({
    ...log,
    action_details: log.action_details ? JSON.parse(log.action_details) : {}
  }));
}

async function getRelatedTransactions(mcpClient: any, transactionId: string) {
  const dataset = 'ksingamsetty-test.AI_POC';
  
  // Find transactions with similar characteristics
  const query = `
    WITH current_transaction AS (
      SELECT amount, description, account_id, currency_code, transaction_date
      FROM ${dataset}.cash_transactions
      WHERE transaction_id = '${transactionId}'
    )
    SELECT 
      t.transaction_id,
      t.amount,
      t.description,
      t.transaction_date,
      -- Calculate similarity score based on amount and description
      CASE 
        WHEN ABS(t.amount - ct.amount) / GREATEST(t.amount, ct.amount) < 0.1 THEN 0.5
        ELSE 0.0
      END +
      CASE 
        WHEN t.account_id = ct.account_id THEN 0.3
        ELSE 0.0
      END +
      CASE 
        WHEN t.currency_code = ct.currency_code THEN 0.2
        ELSE 0.0
      END as similarity_score,
      'similar_characteristics' as relationship_type
    FROM ${dataset}.cash_transactions t
    CROSS JOIN current_transaction ct
    WHERE t.transaction_id != '${transactionId}'
      AND (
        ABS(t.amount - ct.amount) / GREATEST(t.amount, ct.amount) < 0.1 -- Similar amount
        OR t.account_id = ct.account_id -- Same account
        OR CONTAINS_SUBSTR(UPPER(t.description), SPLIT(UPPER(ct.description), ' ')[SAFE_OFFSET(0)]) -- Similar description words
      )
    HAVING similarity_score > 0.3
    ORDER BY similarity_score DESC
    LIMIT 10
  `;

  return await mcpClient.executeQueryWithRetry(query);
}