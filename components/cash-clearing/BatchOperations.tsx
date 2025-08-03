'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { ConfidenceBadge } from './ConfidenceIndicator';
import type { CashTransaction, CashClearingSuggestion } from '../../lib/types';

export interface BatchOperation {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  requiresConfirmation: boolean;
  requiresReason?: boolean;
  minConfidence?: number;
  maxItems?: number;
  estimatedTime?: number; // seconds
  riskLevel: 'low' | 'medium' | 'high';
}

export interface BatchOperationResult {
  operation: string;
  totalItems: number;
  successCount: number;
  failureCount: number;
  duration: number;
  errors: Array<{
    itemId: string;
    error: string;
  }>;
}

export interface BatchOperationsProps {
  selectedTransactionIds: string[];
  transactions: CashTransaction[];
  suggestions: CashClearingSuggestion[];
  onBatchApprove?: (suggestionIds: string[], reason?: string) => Promise<BatchOperationResult>;
  onBatchReject?: (suggestionIds: string[], reason: string) => Promise<BatchOperationResult>;
  onBatchReprocess?: (transactionIds: string[]) => Promise<BatchOperationResult>;
  onBatchExport?: (transactionIds: string[], format: string) => Promise<void>;
  onBatchDelete?: (transactionIds: string[]) => Promise<BatchOperationResult>;
  onBatchAssignGL?: (suggestionIds: string[], glAccount: string) => Promise<BatchOperationResult>;
  isLoading?: boolean;
  className?: string;
  maxBatchSize?: number;
  enabledOperations?: string[];
}

const DEFAULT_OPERATIONS: BatchOperation[] = [
  {
    id: 'approve',
    name: 'Approve All',
    description: 'Approve all selected suggestions',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
    ),
    requiresConfirmation: true,
    riskLevel: 'medium',
    estimatedTime: 2
  },
  {
    id: 'reject',
    name: 'Reject All',
    description: 'Reject all selected suggestions',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
      </svg>
    ),
    requiresConfirmation: true,
    requiresReason: true,
    riskLevel: 'high',
    estimatedTime: 2
  },
  {
    id: 'reprocess',
    name: 'Reprocess',
    description: 'Reprocess selected transactions through AI workflow',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
      </svg>
    ),
    requiresConfirmation: true,
    riskLevel: 'medium',
    maxItems: 50,
    estimatedTime: 30
  },
  {
    id: 'export',
    name: 'Export',
    description: 'Export selected transactions to file',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
      </svg>
    ),
    requiresConfirmation: false,
    riskLevel: 'low',
    estimatedTime: 5
  },
  {
    id: 'assign-gl',
    name: 'Assign GL Account',
    description: 'Assign GL account to selected suggestions',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
        <path fillRule="evenodd" d="M4 5a2 2 0 012-2v1a1 1 0 001 1h6a1 1 0 001-1V3a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
      </svg>
    ),
    requiresConfirmation: true,
    riskLevel: 'medium',
    estimatedTime: 3
  },
  {
    id: 'delete',
    name: 'Delete',
    description: 'Delete selected transactions (cannot be undone)',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    ),
    requiresConfirmation: true,
    requiresReason: true,
    riskLevel: 'high',
    estimatedTime: 1
  }
];

export function BatchOperations({
  selectedTransactionIds,
  transactions,
  suggestions,
  onBatchApprove,
  onBatchReject,
  onBatchReprocess,
  onBatchExport,
  onBatchDelete,
  onBatchAssignGL,
  isLoading = false,
  className = '',
  maxBatchSize = 100,
  enabledOperations = ['approve', 'reject', 'reprocess', 'export']
}: BatchOperationsProps) {
  const [activeOperation, setActiveOperation] = useState<string | null>(null);
  const [confirmationStep, setConfirmationStep] = useState(false);
  const [operationReason, setOperationReason] = useState('');
  const [glAccount, setGlAccount] = useState('');
  const [exportFormat, setExportFormat] = useState('csv');
  const [operationResult, setOperationResult] = useState<BatchOperationResult | null>(null);

  // Get selected transactions and suggestions
  const selectedTransactions = useMemo(() => {
    return transactions.filter(t => selectedTransactionIds.includes(t.transaction_id));
  }, [transactions, selectedTransactionIds]);

  const selectedSuggestions = useMemo(() => {
    return suggestions.filter(s => selectedTransactionIds.includes(s.transaction_id));
  }, [suggestions, selectedTransactionIds]);

  const pendingSuggestions = useMemo(() => {
    return selectedSuggestions.filter(s => s.approval_status === 'PENDING');
  }, [selectedSuggestions]);

  // Calculate statistics
  const selectionStats = useMemo(() => {
    const totalAmount = selectedTransactions.reduce((sum, t) => sum + t.amount, 0);
    const avgConfidence = selectedSuggestions.length > 0 
      ? selectedSuggestions.reduce((sum, s) => sum + s.confidence_score, 0) / selectedSuggestions.length
      : 0;
    const highRiskCount = selectedSuggestions.filter(s => s.confidence_score < 0.6).length;
    const highValueCount = selectedTransactions.filter(t => t.amount > 10000).length;

    return {
      totalAmount,
      avgConfidence,
      highRiskCount,
      highValueCount,
      pendingCount: pendingSuggestions.length
    };
  }, [selectedTransactions, selectedSuggestions, pendingSuggestions]);

  // Filter available operations
  const availableOperations = useMemo(() => {
    return DEFAULT_OPERATIONS.filter(op => {
      if (!enabledOperations.includes(op.id)) return false;
      
      switch (op.id) {
        case 'approve':
        case 'reject':
          return pendingSuggestions.length > 0;
        case 'assign-gl':
          return selectedSuggestions.length > 0;
        case 'reprocess':
        case 'export':
        case 'delete':
          return selectedTransactions.length > 0;
        default:
          return true;
      }
    });
  }, [enabledOperations, pendingSuggestions, selectedSuggestions, selectedTransactions]);

  // Handle operation selection
  const handleOperationSelect = useCallback((operationId: string) => {
    const operation = DEFAULT_OPERATIONS.find(op => op.id === operationId);
    if (!operation) return;

    setActiveOperation(operationId);
    setOperationReason('');
    setGlAccount('');
    setOperationResult(null);

    if (operation.requiresConfirmation) {
      setConfirmationStep(true);
    } else {
      handleOperationExecute(operationId);
    }
  }, []);

  // Handle operation execution
  const handleOperationExecute = useCallback(async (operationId: string) => {
    if (!activeOperation) return;

    const operation = DEFAULT_OPERATIONS.find(op => op.id === operationId);
    if (!operation) return;

    // Validate requirements
    if (operation.requiresReason && !operationReason.trim()) {
      return;
    }

    if (operation.maxItems && selectedTransactionIds.length > operation.maxItems) {
      alert(`This operation is limited to ${operation.maxItems} items. Please select fewer transactions.`);
      return;
    }

    try {
      let result: BatchOperationResult | undefined;

      switch (operationId) {
        case 'approve':
          if (onBatchApprove) {
            const suggestionIds = pendingSuggestions.map(s => s.suggestion_id!).filter(Boolean);
            result = await onBatchApprove(suggestionIds, operationReason || undefined);
          }
          break;

        case 'reject':
          if (onBatchReject) {
            const suggestionIds = pendingSuggestions.map(s => s.suggestion_id!).filter(Boolean);
            result = await onBatchReject(suggestionIds, operationReason);
          }
          break;

        case 'reprocess':
          if (onBatchReprocess) {
            result = await onBatchReprocess(selectedTransactionIds);
          }
          break;

        case 'export':
          if (onBatchExport) {
            await onBatchExport(selectedTransactionIds, exportFormat);
            result = {
              operation: 'export',
              totalItems: selectedTransactionIds.length,
              successCount: selectedTransactionIds.length,
              failureCount: 0,
              duration: 1000,
              errors: []
            };
          }
          break;

        case 'assign-gl':
          if (onBatchAssignGL && glAccount.trim()) {
            const suggestionIds = selectedSuggestions.map(s => s.suggestion_id!).filter(Boolean);
            result = await onBatchAssignGL(suggestionIds, glAccount.trim());
          }
          break;

        case 'delete':
          if (onBatchDelete) {
            result = await onBatchDelete(selectedTransactionIds);
          }
          break;
      }

      if (result) {
        setOperationResult(result);
      }

    } catch (error) {
      console.error('Batch operation failed:', error);
      setOperationResult({
        operation: operationId,
        totalItems: selectedTransactionIds.length,
        successCount: 0,
        failureCount: selectedTransactionIds.length,
        duration: 0,
        errors: [{
          itemId: 'general',
          error: error instanceof Error ? error.message : 'Unknown error'
        }]
      });
    }
  }, [
    activeOperation, operationReason, glAccount, exportFormat, selectedTransactionIds,
    pendingSuggestions, selectedSuggestions, onBatchApprove, onBatchReject,
    onBatchReprocess, onBatchExport, onBatchAssignGL, onBatchDelete
  ]);

  // Reset operation state
  const resetOperation = useCallback(() => {
    setActiveOperation(null);
    setConfirmationStep(false);
    setOperationReason('');
    setGlAccount('');
    setOperationResult(null);
  }, []);

  if (selectedTransactionIds.length === 0) {
    return (
      <div className={`bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 text-center ${className}`}>
        <div className="text-gray-500 dark:text-gray-400">
          <svg className="w-8 h-8 mx-auto mb-2" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
          <p className="text-sm">Select transactions to enable batch operations</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Batch Operations
          </h3>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
            {selectedTransactionIds.length} selected
          </span>
        </div>
      </div>

      {/* Selection Summary */}
      <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 text-sm">
          <div>
            <div className="text-gray-500 dark:text-gray-400">Total Amount</div>
            <div className="font-semibold text-gray-900 dark:text-gray-100">
              {new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD'
              }).format(selectionStats.totalAmount)}
            </div>
          </div>
          
          <div>
            <div className="text-gray-500 dark:text-gray-400">Avg Confidence</div>
            <div className="font-semibold">
              <ConfidenceBadge confidence={selectionStats.avgConfidence} size="sm" />
            </div>
          </div>
          
          <div>
            <div className="text-gray-500 dark:text-gray-400">Pending Approval</div>
            <div className="font-semibold text-yellow-600 dark:text-yellow-400">
              {selectionStats.pendingCount}
            </div>
          </div>
          
          <div>
            <div className="text-gray-500 dark:text-gray-400">High Risk</div>
            <div className="font-semibold text-red-600 dark:text-red-400">
              {selectionStats.highRiskCount}
            </div>
          </div>
          
          <div>
            <div className="text-gray-500 dark:text-gray-400">High Value</div>
            <div className="font-semibold text-orange-600 dark:text-orange-400">
              {selectionStats.highValueCount}
            </div>
          </div>
        </div>
      </div>

      {/* Operation Result */}
      {operationResult && (
        <div className="px-6 py-4 bg-blue-50 dark:bg-blue-900/20 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-start space-x-3">
            <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
              operationResult.failureCount === 0 
                ? 'bg-green-500 text-white' 
                : operationResult.successCount === 0
                ? 'bg-red-500 text-white'
                : 'bg-yellow-500 text-white'
            }`}>
              {operationResult.failureCount === 0 ? (
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Operation Complete
              </h4>
              <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {operationResult.successCount} of {operationResult.totalItems} items processed successfully
                {operationResult.failureCount > 0 && ` (${operationResult.failureCount} failed)`}
                {' '}in {(operationResult.duration / 1000).toFixed(1)}s
              </div>
              
              {operationResult.errors.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm text-red-600 dark:text-red-400">
                    View errors ({operationResult.errors.length})
                  </summary>
                  <div className="mt-2 text-xs bg-red-50 dark:bg-red-900/20 rounded p-2 max-h-32 overflow-y-auto">
                    {operationResult.errors.map((error, index) => (
                      <div key={index} className="mb-1 last:mb-0">
                        <strong>{error.itemId}:</strong> {error.error}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
            
            <button
              onClick={resetOperation}
              className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
            >
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Step */}
      {confirmationStep && activeOperation && (
        <div className="px-6 py-4 bg-yellow-50 dark:bg-yellow-900/20 border-b border-gray-200 dark:border-gray-700">
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-6 h-6 text-yellow-600 dark:text-yellow-400">
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              
              <div className="flex-1">
                <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Confirm {DEFAULT_OPERATIONS.find(op => op.id === activeOperation)?.name}
                </h4>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {DEFAULT_OPERATIONS.find(op => op.id === activeOperation)?.description}
                </p>
                
                <div className="mt-3 text-sm">
                  <div className="text-gray-600 dark:text-gray-400">
                    You are about to perform this operation on <strong>{selectedTransactionIds.length}</strong> transactions.
                    {DEFAULT_OPERATIONS.find(op => op.id === activeOperation)?.estimatedTime && (
                      <span> Estimated time: {DEFAULT_OPERATIONS.find(op => op.id === activeOperation)?.estimatedTime}s</span>
                    )}
                  </div>
                </div>

                {/* Operation-specific inputs */}
                {activeOperation === 'reject' && (
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Rejection reason *
                    </label>
                    <textarea
                      value={operationReason}
                      onChange={(e) => setOperationReason(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      placeholder="Please provide a reason for rejection..."
                    />
                  </div>
                )}

                {activeOperation === 'assign-gl' && (
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      GL Account Code *
                    </label>
                    <input
                      type="text"
                      value={glAccount}
                      onChange={(e) => setGlAccount(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      placeholder="e.g., 1001, 2001, etc."
                    />
                  </div>
                )}

                {activeOperation === 'export' && (
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Export Format
                    </label>
                    <select
                      value={exportFormat}
                      onChange={(e) => setExportFormat(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    >
                      <option value="csv">CSV</option>
                      <option value="excel">Excel</option>
                      <option value="json">JSON</option>
                      <option value="pdf">PDF</option>
                    </select>
                  </div>
                )}

                {activeOperation === 'approve' && (
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Approval note (optional)
                    </label>
                    <input
                      type="text"
                      value={operationReason}
                      onChange={(e) => setOperationReason(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      placeholder="Optional note for approval..."
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => handleOperationExecute(activeOperation)}
                disabled={isLoading || (
                  (activeOperation === 'reject' && !operationReason.trim()) ||
                  (activeOperation === 'assign-gl' && !glAccount.trim())
                )}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  DEFAULT_OPERATIONS.find(op => op.id === activeOperation)?.riskLevel === 'high'
                    ? 'text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400'
                    : DEFAULT_OPERATIONS.find(op => op.id === activeOperation)?.riskLevel === 'medium'
                    ? 'text-white bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-400'
                    : 'text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400'
                } disabled:cursor-not-allowed`}
              >
                {isLoading ? 'Processing...' : 'Confirm'}
              </button>
              
              <button
                onClick={resetOperation}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Operations Grid */}
      {!confirmationStep && !operationResult && (
        <div className="px-6 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableOperations.map((operation) => {
              const isDisabled = isLoading ||
                (operation.maxItems && selectedTransactionIds.length > operation.maxItems) ||
                (selectedTransactionIds.length > maxBatchSize);

              return (
                <button
                  key={operation.id}
                  onClick={() => !isDisabled && handleOperationSelect(operation.id)}
                  disabled={isDisabled}
                  className={`p-4 text-left rounded-lg border-2 transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
                    operation.riskLevel === 'high'
                      ? 'border-red-200 dark:border-red-800 hover:border-red-300 dark:hover:border-red-700 bg-red-50 dark:bg-red-900/20'
                      : operation.riskLevel === 'medium'
                      ? 'border-yellow-200 dark:border-yellow-800 hover:border-yellow-300 dark:hover:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-gray-50 dark:bg-gray-900'
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <div className={`flex-shrink-0 p-2 rounded-md ${
                      operation.riskLevel === 'high'
                        ? 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30'
                        : operation.riskLevel === 'medium'
                        ? 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30'
                        : 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30'
                    }`}>
                      {operation.icon}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {operation.name}
                      </h4>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {operation.description}
                      </p>
                      
                      {operation.estimatedTime && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          ~{operation.estimatedTime}s per item
                        </p>
                      )}
                      
                      {operation.maxItems && selectedTransactionIds.length > operation.maxItems && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                          Limited to {operation.maxItems} items
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}