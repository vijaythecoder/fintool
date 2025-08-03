'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ApprovalWorkflowStep } from './ApprovalWorkflowStep';
import { TransactionApprovalQueue } from './TransactionApprovalQueue';
import { PatternMatchingReview, type PatternMatchReview } from './PatternMatchingReview';
import { GLAccountMappingReview, type GLMappingReview } from './GLAccountMappingReview';
import { ConfidenceIndicator } from './ConfidenceIndicator';
import type { 
  WorkflowState, 
  CashTransaction, 
  CashClearingSuggestion, 
  ProcessorPattern, 
  GLPattern,
  WorkflowExecutionResult
} from '../../lib/types';

export interface CashClearingDashboardProps {
  workflowState?: WorkflowState;
  transactions: CashTransaction[];
  suggestions: CashClearingSuggestion[];
  patterns?: ProcessorPattern[];
  glMappings?: GLPattern[];
  executionResult?: WorkflowExecutionResult;
  onRefresh?: () => Promise<void>;
  onApproveTransaction?: (suggestionId: string, reason?: string) => Promise<void>;
  onRejectTransaction?: (suggestionId: string, reason: string) => Promise<void>;
  onBatchApprove?: (suggestionIds: string[]) => Promise<void>;
  onBatchReject?: (suggestionIds: string[], reason: string) => Promise<void>;
  onApprovePattern?: (patternId: string, reason?: string) => Promise<void>;
  onRejectPattern?: (patternId: string, reason: string) => Promise<void>;
  onApproveGLMapping?: (glPatternId: string, reason?: string) => Promise<void>;
  onRejectGLMapping?: (glPatternId: string, reason: string) => Promise<void>;
  onStartWorkflow?: () => Promise<void>;
  onPauseWorkflow?: () => Promise<void>;
  onResumeWorkflow?: () => Promise<void>;
  isLoading?: boolean;
  className?: string;
}

export function CashClearingDashboard({
  workflowState,
  transactions,
  suggestions,
  patterns = [],
  glMappings = [],
  executionResult,
  onRefresh,
  onApproveTransaction,
  onRejectTransaction,
  onBatchApprove,
  onBatchReject,
  onApprovePattern,
  onRejectPattern,
  onApproveGLMapping,
  onRejectGLMapping,
  onStartWorkflow,
  onPauseWorkflow,
  onResumeWorkflow,
  isLoading = false,
  className = ''
}: CashClearingDashboardProps) {
  const [activeView, setActiveView] = useState<'overview' | 'transactions' | 'patterns' | 'gl-mappings'>('overview');
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Auto-refresh functionality
  useEffect(() => {
    if (autoRefresh && onRefresh) {
      const interval = setInterval(onRefresh, 30000); // 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh, onRefresh]);

  // Calculate dashboard metrics
  const metrics = useMemo(() => {
    const totalTransactions = transactions.length;
    const pendingSuggestions = suggestions.filter(s => s.approval_status === 'PENDING').length;
    const approvedSuggestions = suggestions.filter(s => s.approval_status === 'APPROVED').length;
    const rejectedSuggestions = suggestions.filter(s => s.approval_status === 'REJECTED').length;
    const autoApprovedSuggestions = suggestions.filter(s => s.approval_status === 'AUTO_APPROVED').length;
    
    const avgConfidence = suggestions.length > 0 
      ? suggestions.reduce((sum, s) => sum + s.confidence_score, 0) / suggestions.length
      : 0;

    const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
    const processedAmount = transactions
      .filter(t => {
        const suggestion = suggestions.find(s => s.transaction_id === t.transaction_id);
        return suggestion && ['APPROVED', 'AUTO_APPROVED'].includes(suggestion.approval_status);
      })
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      totalTransactions,
      pendingSuggestions,
      approvedSuggestions,
      rejectedSuggestions,
      autoApprovedSuggestions,
      avgConfidence,
      totalAmount,
      processedAmount,
      processingRate: totalTransactions > 0 ? (approvedSuggestions + autoApprovedSuggestions) / totalTransactions : 0
    };
  }, [transactions, suggestions]);

  // Prepare pattern reviews for PatternMatchingReview component
  const patternReviews: PatternMatchReview[] = useMemo(() => {
    const patternMap = new Map<string, PatternMatchReview>();
    
    patterns.forEach(pattern => {
      const patternSuggestions = suggestions.filter(s => s.pattern_matched === pattern.pattern_id);
      const matches = patternSuggestions.map(suggestion => {
        const transaction = transactions.find(t => t.transaction_id === suggestion.transaction_id);
        return {
          transaction: transaction!,
          suggestion,
          matchDetails: {
            matchType: 'exact' as const, // This would come from actual matching logic
            matchScore: suggestion.confidence_score,
            matchedFields: ['description', 'amount'], // This would come from matching details
          }
        };
      }).filter(m => m.transaction);

      if (matches.length > 0) {
        const overallConfidence = matches.reduce((sum, m) => sum + m.suggestion.confidence_score, 0) / matches.length;
        
        // Transform matches to expected format
        const suggestions = matches.map(m => ({
          suggestion: m.suggestion,
          transaction: m.transaction,
          matchStrength: m.matchDetails.matchScore,
          matchDetails: JSON.stringify(m.matchDetails)
        }));
        
        patternMap.set(pattern.pattern_id, {
          pattern,
          suggestions,
          overallConfidence,
          reviewStatus: 'pending' // This would come from actual review status
        });
      }
    });
    
    return Array.from(patternMap.values());
  }, [patterns, suggestions, transactions]);

  // Prepare GL mapping reviews for GLAccountMappingReview component
  const glMappingReviews: GLMappingReview[] = useMemo(() => {
    const glMap = new Map<string, GLMappingReview>();
    
    glMappings.forEach(glMapping => {
      const glSuggestions = suggestions.filter(s => s.gl_account_code === glMapping.gl_account_code);
      const suggestionData = glSuggestions.map(suggestion => {
        const transaction = transactions.find(t => t.transaction_id === suggestion.transaction_id);
        return {
          suggestion,
          transaction: transaction!,
          mappingConfidence: glMapping.mapping_confidence,
          validationIssues: [] // This would come from validation logic
        };
      }).filter(s => s.transaction);

      if (suggestionData.length > 0) {
        const totalAmount = suggestionData.reduce((sum, s) => sum + s.transaction.amount, 0);
        const businessUnits = [...new Set(suggestionData.map(s => glMapping.business_unit).filter(Boolean))] as string[];
        const costCenters = [...new Set(suggestionData.map(s => glMapping.cost_center).filter(Boolean))] as string[];
        
        glMap.set(glMapping.gl_pattern_id, {
          glPattern: glMapping,
          suggestions: suggestionData,
          overallConfidence: glMapping.mapping_confidence,
          reviewStatus: 'pending', // This would come from actual review status
          businessImpact: {
            totalAmount,
            transactionCount: suggestionData.length,
            businessUnits,
            costCenters
          }
        });
      }
    });
    
    return Array.from(glMap.values());
  }, [glMappings, suggestions, transactions]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getWorkflowStatusColor = (status?: string) => {
    switch (status) {
      case 'RUNNING': return 'text-blue-600 dark:text-blue-400';
      case 'COMPLETED': return 'text-green-600 dark:text-green-400';
      case 'FAILED': return 'text-red-600 dark:text-red-400';
      case 'PAUSED': return 'text-yellow-600 dark:text-yellow-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Cash Clearing Workflow
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Human approval dashboard for AI-processed transactions
            </p>
            {workflowState && (
              <div className="flex items-center space-x-2 mt-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Workflow Status:</span>
                <span className={`text-sm font-medium ${getWorkflowStatusColor(workflowState.workflow_status)}`}>
                  {workflowState.workflow_status}
                </span>
                {workflowState.current_step && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    (Step {workflowState.current_step})
                  </span>
                )}
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-3">
            <label className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
              />
              <span>Auto-refresh</span>
            </label>
            
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 rounded-md hover:bg-blue-200 dark:hover:bg-blue-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            )}
            
            {workflowState?.workflow_status === 'PAUSED' && onResumeWorkflow && (
              <button
                onClick={onResumeWorkflow}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30 rounded-md hover:bg-green-200 dark:hover:bg-green-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Resume
              </button>
            )}
            
            {workflowState?.workflow_status === 'RUNNING' && onPauseWorkflow && (
              <button
                onClick={onPauseWorkflow}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-yellow-700 dark:text-yellow-300 bg-yellow-100 dark:bg-yellow-900/30 rounded-md hover:bg-yellow-200 dark:hover:bg-yellow-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Pause
              </button>
            )}
            
            {!workflowState && onStartWorkflow && (
              <button
                onClick={onStartWorkflow}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Start Workflow
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h4a2 2 0 012 2v2a2 2 0 01-2 2H8a2 2 0 01-2-2v-2z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Transactions</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{metrics.totalTransactions}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <svg className="w-6 h-6 text-yellow-600 dark:text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Pending Approval</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{metrics.pendingSuggestions}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <svg className="w-6 h-6 text-green-600 dark:text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Processing Rate</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{(metrics.processingRate * 100).toFixed(1)}%</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.51-1.31c-.562-.649-1.413-1.076-2.353-1.253V5z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Amount</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(metrics.totalAmount)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            {[
              { id: 'overview', name: 'Workflow Overview', count: null },
              { id: 'transactions', name: 'Transaction Queue', count: metrics.pendingSuggestions },
              { id: 'patterns', name: 'Pattern Review', count: patternReviews.length },
              { id: 'gl-mappings', name: 'GL Mappings', count: glMappingReviews.length }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveView(tab.id as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeView === tab.id
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                {tab.name}
                {tab.count !== null && tab.count > 0 && (
                  <span className={`ml-2 py-0.5 px-2 rounded-full text-xs font-medium ${
                    activeView === tab.id
                      ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeView === 'overview' && (
            <div className="space-y-6">
              {/* Workflow Steps */}
              {workflowState && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Workflow Progress</h3>
                  
                  <ApprovalWorkflowStep
                    stepNumber={1}
                    title="Pattern Matching"
                    description="AI analyzes transaction patterns and identifies matching rules"
                    status={workflowState.current_step >= 1 ? 'completed' : 'pending'}
                    confidence={0.92}
                    itemCount={transactions.length}
                    processingTime={executionResult?.stepResults.step1.timeMs}
                  />
                  
                  <ApprovalWorkflowStep
                    stepNumber={2}
                    title="GL Account Mapping"
                    description="Transactions are mapped to appropriate GL accounts based on patterns"
                    status={workflowState.current_step >= 2 ? 'completed' : workflowState.current_step === 2 ? 'in_progress' : 'pending'}
                    confidence={0.87}
                    itemCount={suggestions.filter(s => s.workflow_step === 2).length}
                    processingTime={executionResult?.stepResults.step2.timeMs}
                  />
                  
                  <ApprovalWorkflowStep
                    stepNumber={3}
                    title="Human Review Required"
                    description="Low confidence suggestions require human approval"
                    status={metrics.pendingSuggestions > 0 ? 'requires_approval' : workflowState.current_step >= 3 ? 'completed' : 'pending'}
                    pendingCount={metrics.pendingSuggestions}
                    itemCount={suggestions.length}
                    onReview={() => setActiveView('transactions')}
                  />
                  
                  <ApprovalWorkflowStep
                    stepNumber={4}
                    title="Final Processing"
                    description="Approved transactions are processed and journal entries created"
                    status={workflowState.current_step >= 4 ? 'completed' : 'pending'}
                    itemCount={metrics.approvedSuggestions + metrics.autoApprovedSuggestions}
                    processingTime={executionResult?.stepResults.step4.timeMs}
                  />
                </div>
              )}

              {/* Overall Confidence */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
                <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">Overall Processing Confidence</h4>
                <ConfidenceIndicator
                  confidence={metrics.avgConfidence}
                  size="lg"
                  showPercentage={true}
                  showLabel={true}
                />
              </div>
            </div>
          )}

          {activeView === 'transactions' && (
            <TransactionApprovalQueue
              transactions={transactions}
              suggestions={suggestions}
              patterns={patterns}
              glMappings={glMappings}
              onApprove={onApproveTransaction}
              onReject={onRejectTransaction}
              onBatchApprove={onBatchApprove}
              onBatchReject={onBatchReject}
              isLoading={isLoading}
            />
          )}

          {activeView === 'patterns' && (
            <PatternMatchingReview
              patternReviews={patternReviews}
              onApprovePattern={onApprovePattern}
              onRejectPattern={onRejectPattern}
              isLoading={isLoading}
            />
          )}

          {activeView === 'gl-mappings' && (
            <GLAccountMappingReview
              glMappingReviews={glMappingReviews}
              onApproveMapping={onApproveGLMapping}
              onRejectMapping={onRejectGLMapping}
              onApproveSuggestion={onApproveTransaction}
              onRejectSuggestion={onRejectTransaction}
              isLoading={isLoading}
            />
          )}
        </div>
      </div>
    </div>
  );
}