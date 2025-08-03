'use client';

import React, { useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { ConfidenceIndicator, ConfidenceBadge } from './ConfidenceIndicator';
import type { CashTransaction, CashClearingSuggestion, ProcessorPattern, GLPattern } from '../../lib/types';

export interface TransactionDetailsModalProps {
  transaction?: CashTransaction | null;
  suggestion?: CashClearingSuggestion | null;
  pattern?: ProcessorPattern | null;
  glMapping?: GLPattern | null;
  isOpen: boolean;
  onClose: () => void;
  onApprove?: (suggestionId: string, reason?: string) => void;
  onReject?: (suggestionId: string, reason: string) => void;
  isLoading?: boolean;
}

export function TransactionDetailsModal({
  transaction,
  suggestion,
  pattern,
  glMapping,
  isOpen,
  onClose,
  onApprove,
  onReject,
  isLoading = false
}: TransactionDetailsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      modalRef.current?.focus();
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const [approvalReason, setApprovalReason] = React.useState('');
  const [rejectionReason, setRejectionReason] = React.useState('');
  const [showApprovalForm, setShowApprovalForm] = React.useState(false);
  const [showRejectionForm, setShowRejectionForm] = React.useState(false);

  if (!isOpen || !transaction) return null;

  const formatCurrency = (amount: number, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    const statusClasses = {
      'PENDING': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      'APPROVED': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      'REJECTED': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      'AUTO_APPROVED': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        statusClasses[status as keyof typeof statusClasses] || statusClasses.PENDING
      }`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="transaction-modal-title"
    >
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75" />

        {/* Modal content */}
        <div
          ref={modalRef}
          className="inline-block w-full max-w-4xl p-0 my-8 overflow-hidden text-left align-middle transition-all transform bg-white dark:bg-gray-800 shadow-xl rounded-lg"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h3 id="transaction-modal-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Transaction Details
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                ID: {transaction.transaction_id}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Close modal"
            >
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-4 max-h-[80vh] overflow-y-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Transaction Information */}
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Transaction Information</h4>
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Amount</label>
                        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {formatCurrency(transaction.amount, transaction.currency_code)}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Date</label>
                        <p className="text-sm text-gray-900 dark:text-gray-100">
                          {format(new Date(transaction.transaction_date), 'MMM dd, yyyy HH:mm')}
                        </p>
                      </div>
                    </div>
                    
                    <div>
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Description</label>
                      <p className="text-sm text-gray-900 dark:text-gray-100">{transaction.description}</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Account ID</label>
                        <p className="text-sm text-gray-900 dark:text-gray-100">{transaction.account_id}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Source System</label>
                        <p className="text-sm text-gray-900 dark:text-gray-100">{transaction.source_system}</p>
                      </div>
                    </div>
                    
                    {transaction.reference_number && (
                      <div>
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Reference Number</label>
                        <p className="text-sm text-gray-900 dark:text-gray-100">{transaction.reference_number}</p>
                      </div>
                    )}
                    
                    <div>
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Pattern</label>
                      <p className="text-sm text-gray-900 dark:text-gray-100">{transaction.pattern}</p>
                    </div>
                  </div>
                </div>

                {/* Original Data */}
                {transaction.original_data && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Original Data</h4>
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                      <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(transaction.original_data, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>

              {/* AI Suggestion & GL Mapping */}
              <div className="space-y-4">
                {/* AI Suggestion */}
                {suggestion && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">AI Suggestion</h4>
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                          Workflow Step {suggestion.workflow_step}
                        </span>
                        {getStatusBadge(suggestion.approval_status)}
                      </div>
                      
                      <div className="flex items-center space-x-3">
                        <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Confidence</span>
                        <ConfidenceIndicator
                          confidence={suggestion.confidence_score}
                          size="sm"
                          showPercentage={true}
                        />
                      </div>
                      
                      {suggestion.pattern_matched && (
                        <div>
                          <label className="text-xs font-medium text-blue-700 dark:text-blue-300">Pattern Matched</label>
                          <p className="text-sm text-blue-900 dark:text-blue-100">{suggestion.pattern_matched}</p>
                        </div>
                      )}
                      
                      {suggestion.reasoning?.ai_analysis && (
                        <div>
                          <label className="text-xs font-medium text-blue-700 dark:text-blue-300">AI Analysis</label>
                          <p className="text-sm text-blue-900 dark:text-blue-100">{suggestion.reasoning.ai_analysis}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* GL Account Mapping */}
                {suggestion && suggestion.gl_account_code && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">GL Account Mapping</h4>
                    <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-medium text-green-700 dark:text-green-300">Account Code</label>
                          <p className="text-sm font-mono text-green-900 dark:text-green-100">{suggestion.gl_account_code}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-green-700 dark:text-green-300">Debit/Credit</label>
                          <p className="text-sm text-green-900 dark:text-green-100">{suggestion.debit_credit_indicator}</p>
                        </div>
                      </div>
                      
                      {suggestion.gl_account_name && (
                        <div>
                          <label className="text-xs font-medium text-green-700 dark:text-green-300">Account Name</label>
                          <p className="text-sm text-green-900 dark:text-green-100">{suggestion.gl_account_name}</p>
                        </div>
                      )}
                      
                      <div>
                        <label className="text-xs font-medium text-green-700 dark:text-green-300">Amount</label>
                        <p className="text-lg font-semibold text-green-900 dark:text-green-100">
                          {formatCurrency(suggestion.amount, transaction.currency_code)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Pattern Details */}
                {pattern && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Pattern Details</h4>
                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 space-y-3">
                      <div>
                        <label className="text-xs font-medium text-purple-700 dark:text-purple-300">Pattern Name</label>
                        <p className="text-sm text-purple-900 dark:text-purple-100">{pattern.pattern_name}</p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-medium text-purple-700 dark:text-purple-300">Type</label>
                          <p className="text-sm text-purple-900 dark:text-purple-100">{pattern.pattern_type}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-purple-700 dark:text-purple-300">Priority</label>
                          <p className="text-sm text-purple-900 dark:text-purple-100">{pattern.priority_order}</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-medium text-purple-700 dark:text-purple-300">Amount Tolerance</label>
                          <p className="text-sm text-purple-900 dark:text-purple-100">{(pattern.amount_tolerance * 100).toFixed(1)}%</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-purple-700 dark:text-purple-300">Date Tolerance</label>
                          <p className="text-sm text-purple-900 dark:text-purple-100">{pattern.date_tolerance_days} days</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          {suggestion && suggestion.approval_status === 'PENDING' && (onApprove || onReject) && (
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              {!showApprovalForm && !showRejectionForm ? (
                <div className="flex justify-end space-x-3">
                  {onReject && (
                    <button
                      onClick={() => setShowRejectionForm(true)}
                      disabled={isLoading}
                      className="px-4 py-2 text-sm font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 rounded-md hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Reject
                    </button>
                  )}
                  {onApprove && (
                    <button
                      onClick={() => setShowApprovalForm(true)}
                      disabled={isLoading}
                      className="px-4 py-2 text-sm font-medium text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30 rounded-md hover:bg-green-200 dark:hover:bg-green-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Approve
                    </button>
                  )}
                </div>
              ) : showApprovalForm ? (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Approval Reason (Optional)
                  </label>
                  <textarea
                    value={approvalReason}
                    onChange={(e) => setApprovalReason(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    rows={3}
                    placeholder="Optional reason for approval..."
                  />
                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => {
                        setShowApprovalForm(false);
                        setApprovalReason('');
                      }}
                      className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        onApprove!(suggestion.suggestion_id!, approvalReason || undefined);
                        setShowApprovalForm(false);
                        setApprovalReason('');
                      }}
                      disabled={isLoading}
                      className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isLoading ? 'Approving...' : 'Confirm Approval'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Rejection Reason *
                  </label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    rows={3}
                    placeholder="Please provide a reason for rejection..."
                    required
                  />
                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => {
                        setShowRejectionForm(false);
                        setRejectionReason('');
                      }}
                      className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (rejectionReason.trim()) {
                          onReject!(suggestion.suggestion_id!, rejectionReason);
                          setShowRejectionForm(false);
                          setRejectionReason('');
                        }
                      }}
                      disabled={isLoading || !rejectionReason.trim()}
                      className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isLoading ? 'Rejecting...' : 'Confirm Rejection'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}