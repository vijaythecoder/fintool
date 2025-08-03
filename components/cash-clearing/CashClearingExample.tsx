'use client';

import React, { useState, useEffect } from 'react';
import { CashClearingDashboard } from './CashClearingDashboard';
import type { 
  WorkflowState, 
  CashTransaction, 
  CashClearingSuggestion, 
  ProcessorPattern, 
  GLPattern,
  WorkflowExecutionResult
} from '../../lib/types';

/**
 * Example integration component showing how to use the Cash Clearing Workflow components
 * with BigQuery MCP and real-time updates.
 * 
 * This component demonstrates:
 * - Data fetching from BigQuery using MCP client
 * - Real-time workflow state management
 * - Integration with approval APIs
 * - Error handling and loading states
 * - Chat interface integration
 */
export function CashClearingExample() {
  // Workflow state
  const [workflowState, setWorkflowState] = useState<WorkflowState | undefined>();
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [suggestions, setSuggestions] = useState<CashClearingSuggestion[]>([]);
  const [patterns, setPatterns] = useState<ProcessorPattern[]>([]);
  const [glMappings, setGLMappings] = useState<GLPattern[]>([]);
  const [executionResult, setExecutionResult] = useState<WorkflowExecutionResult | undefined>();
  
  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mock data for demonstration (replace with actual BigQuery MCP calls)
  const mockTransactions: CashTransaction[] = [
    {
      transaction_id: 'TXN-001',
      amount: 1500.00,
      description: 'Payment from ABC Corp for services',
      transaction_date: '2024-01-15T10:30:00Z',
      account_id: 'ACC-12345',
      currency_code: 'USD',
      pattern: 'CUSTOMER_PAYMENT',
      source_system: 'BANK_FEED',
      reference_number: 'REF-ABC-001',
      created_at: '2024-01-15T10:30:00Z'
    },
    {
      transaction_id: 'TXN-002',
      amount: -350.75,
      description: 'Office supplies - Staples',
      transaction_date: '2024-01-15T14:20:00Z',
      account_id: 'ACC-12345',
      currency_code: 'USD',
      pattern: 'EXPENSE_OFFICE',
      source_system: 'CREDIT_CARD',
      created_at: '2024-01-15T14:20:00Z'
    }
  ];

  const mockSuggestions: CashClearingSuggestion[] = [
    {
      suggestion_id: 'SUG-001',
      transaction_id: 'TXN-001',
      workflow_step: 3,
      pattern_matched: 'PAT-CUSTOMER',
      gl_account_code: '1100-001',
      gl_account_name: 'Accounts Receivable',
      debit_credit_indicator: 'DR',
      amount: 1500.00,
      confidence_score: 0.92,
      reasoning: {
        pattern_match_details: {
          matched_fields: ['description', 'amount'],
          similarity_score: 0.95
        },
        gl_mapping_logic: {
          rule_type: 'pattern_based',
          confidence_factors: ['description_match', 'amount_range']
        },
        ai_analysis: 'High confidence customer payment based on description pattern and amount range'
      },
      approval_status: 'PENDING',
      processing_batch_id: 'BATCH-001',
      ai_model: 'gpt-4',
      processing_time_ms: 150
    },
    {
      suggestion_id: 'SUG-002',
      transaction_id: 'TXN-002',
      workflow_step: 3,
      pattern_matched: 'PAT-EXPENSE',
      gl_account_code: '6100-002',
      gl_account_name: 'Office Supplies Expense',
      debit_credit_indicator: 'DR',
      amount: 350.75,
      confidence_score: 0.87,
      reasoning: {
        pattern_match_details: {
          matched_fields: ['description', 'merchant'],
          similarity_score: 0.89
        },
        gl_mapping_logic: {
          rule_type: 'merchant_based',
          confidence_factors: ['merchant_match', 'category_match']
        },
        ai_analysis: 'Office supplies expense identified by merchant and description keywords'
      },
      approval_status: 'PENDING',
      processing_batch_id: 'BATCH-001',
      ai_model: 'gpt-4',
      processing_time_ms: 125
    }
  ];

  const mockPatterns: ProcessorPattern[] = [
    {
      pattern_id: 'PAT-CUSTOMER',
      pattern_name: 'Customer Payment Pattern',
      pattern_type: 'DESCRIPTION',
      pattern_regex: '.*(payment|pay).*from.*(corp|company|inc|ltd).*',
      amount_tolerance: 0.05,
      date_tolerance_days: 3,
      confidence_weight: 0.8,
      priority_order: 1,
      is_active: true
    },
    {
      pattern_id: 'PAT-EXPENSE',
      pattern_name: 'Office Expense Pattern',
      pattern_type: 'COMPOSITE',
      amount_tolerance: 0.1,
      date_tolerance_days: 7,
      confidence_weight: 0.7,
      priority_order: 5,
      is_active: true
    }
  ];

  const mockGLMappings: GLPattern[] = [
    {
      gl_pattern_id: 'GL-001',
      pattern_id: 'PAT-CUSTOMER',
      gl_account_code: '1100-001',
      gl_account_name: 'Accounts Receivable',
      debit_credit_indicator: 'DR',
      account_category: 'ASSET',
      business_unit: 'SALES',
      mapping_confidence: 0.92,
      auto_approve_threshold: 0.85,
      requires_approval: false
    },
    {
      gl_pattern_id: 'GL-002',
      pattern_id: 'PAT-EXPENSE',
      gl_account_code: '6100-002',
      gl_account_name: 'Office Supplies Expense',
      debit_credit_indicator: 'DR',
      account_category: 'EXPENSE',
      business_unit: 'ADMIN',
      cost_center: 'CC-001',
      mapping_confidence: 0.87,
      auto_approve_threshold: 0.8,
      requires_approval: true
    }
  ];

  const mockWorkflowState: WorkflowState = {
    batch_id: 'BATCH-001',
    current_step: 3,
    total_transactions: 2,
    processed_transactions: 2,
    failed_transactions: 0,
    step_1_completed_at: '2024-01-15T10:31:00Z',
    step_2_completed_at: '2024-01-15T10:32:00Z',
    human_approval_required: true,
    approval_checkpoint_step: 3,
    workflow_status: 'RUNNING'
  };

  // Initialize with mock data (replace with actual data fetching)
  useEffect(() => {
    setTransactions(mockTransactions);
    setSuggestions(mockSuggestions);
    setPatterns(mockPatterns);
    setGLMappings(mockGLMappings);
    setWorkflowState(mockWorkflowState);
  }, []);

  // API Integration Functions (replace with actual BigQuery MCP calls)
  
  const refreshData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Example BigQuery MCP integration:
      // const mcpClient = new MCPClient();
      // const transactionsResult = await mcpClient.query(`
      //   SELECT * FROM cash_clearing.transactions 
      //   WHERE batch_id = '${workflowState?.batch_id}'
      // `);
      // setTransactions(transactionsResult.data);
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // For demo, just refresh with current data
      console.log('Refreshing data...');
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh data');
    } finally {
      setIsLoading(false);
    }
  };

  const approveTransaction = async (suggestionId: string, reason?: string) => {
    setIsLoading(true);
    try {
      // Example API call:
      // await fetch('/api/cash-clearing/approve', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ suggestionId, reason })
      // });
      
      // Update local state for demo
      setSuggestions(prev => 
        prev.map(s => 
          s.suggestion_id === suggestionId 
            ? { ...s, approval_status: 'APPROVED' as const, approved_at: new Date().toISOString() }
            : s
        )
      );
      
      console.log(`Approved suggestion: ${suggestionId}`, reason);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve transaction');
    } finally {
      setIsLoading(false);
    }
  };

  const rejectTransaction = async (suggestionId: string, reason: string) => {
    setIsLoading(true);
    try {
      // Example API call:
      // await fetch('/api/cash-clearing/reject', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ suggestionId, reason })
      // });
      
      // Update local state for demo
      setSuggestions(prev => 
        prev.map(s => 
          s.suggestion_id === suggestionId 
            ? { ...s, approval_status: 'REJECTED' as const, approved_at: new Date().toISOString() }
            : s
        )
      );
      
      console.log(`Rejected suggestion: ${suggestionId}`, reason);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject transaction');
    } finally {
      setIsLoading(false);
    }
  };

  const batchApprove = async (suggestionIds: string[]) => {
    setIsLoading(true);
    try {
      // Batch approve API call
      for (const id of suggestionIds) {
        await approveTransaction(id, 'Batch approval');
      }
      console.log(`Batch approved ${suggestionIds.length} suggestions`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to batch approve');
    } finally {
      setIsLoading(false);
    }
  };

  const batchReject = async (suggestionIds: string[], reason: string) => {
    setIsLoading(true);
    try {
      // Batch reject API call
      for (const id of suggestionIds) {
        await rejectTransaction(id, reason);
      }
      console.log(`Batch rejected ${suggestionIds.length} suggestions`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to batch reject');
    } finally {
      setIsLoading(false);
    }
  };

  const approvePattern = async (patternId: string, reason?: string) => {
    console.log(`Approved pattern: ${patternId}`, reason);
    // Implement pattern approval logic
  };

  const rejectPattern = async (patternId: string, reason: string) => {
    console.log(`Rejected pattern: ${patternId}`, reason);
    // Implement pattern rejection logic
  };

  const approveGLMapping = async (glPatternId: string, reason?: string) => {
    console.log(`Approved GL mapping: ${glPatternId}`, reason);
    // Implement GL mapping approval logic
  };

  const rejectGLMapping = async (glPatternId: string, reason: string) => {
    console.log(`Rejected GL mapping: ${glPatternId}`, reason);
    // Implement GL mapping rejection logic
  };

  const startWorkflow = async () => {
    setIsLoading(true);
    try {
      // Start workflow API call
      console.log('Starting workflow...');
      setWorkflowState(prev => prev ? { ...prev, workflow_status: 'RUNNING' } : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start workflow');
    } finally {
      setIsLoading(false);
    }
  };

  const pauseWorkflow = async () => {
    setIsLoading(true);
    try {
      // Pause workflow API call
      console.log('Pausing workflow...');
      setWorkflowState(prev => prev ? { ...prev, workflow_status: 'PAUSED' } : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pause workflow');
    } finally {
      setIsLoading(false);
    }
  };

  const resumeWorkflow = async () => {
    setIsLoading(true);
    try {
      // Resume workflow API call
      console.log('Resuming workflow...');
      setWorkflowState(prev => prev ? { ...prev, workflow_status: 'RUNNING' } : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume workflow');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800 dark:text-red-200">Error</h3>
                <div className="mt-1 text-sm text-red-700 dark:text-red-300">{error}</div>
              </div>
              <div className="ml-auto pl-3">
                <button
                  onClick={() => setError(null)}
                  className="text-red-400 hover:text-red-600 dark:hover:text-red-200"
                >
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Dashboard */}
        <CashClearingDashboard
          workflowState={workflowState}
          transactions={transactions}
          suggestions={suggestions}
          patterns={patterns}
          glMappings={glMappings}
          executionResult={executionResult}
          onRefresh={refreshData}
          onApproveTransaction={approveTransaction}
          onRejectTransaction={rejectTransaction}
          onBatchApprove={batchApprove}
          onBatchReject={batchReject}
          onApprovePattern={approvePattern}
          onRejectPattern={rejectPattern}
          onApproveGLMapping={approveGLMapping}
          onRejectGLMapping={rejectGLMapping}
          onStartWorkflow={startWorkflow}
          onPauseWorkflow={pauseWorkflow}
          onResumeWorkflow={resumeWorkflow}
          isLoading={isLoading}
        />

        {/* Integration Notes */}
        <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <h3 className="text-lg font-medium text-blue-900 dark:text-blue-100 mb-3">Integration Guide</h3>
          <div className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
            <p><strong>BigQuery MCP Integration:</strong> Replace mock data with actual BigQuery queries using the MCP client.</p>
            <p><strong>Real-time Updates:</strong> Implement WebSocket or polling for live workflow updates.</p>
            <p><strong>Chat Integration:</strong> Add chat interface for natural language queries and approvals.</p>
            <p><strong>API Endpoints:</strong> Implement REST API endpoints for approval actions and workflow control.</p>
            <p><strong>Error Handling:</strong> Add comprehensive error handling and validation.</p>
            <p><strong>Authentication:</strong> Implement proper user authentication and authorization.</p>
          </div>
        </div>
      </div>
    </div>
  );
}