'use client';

import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { ConfidenceBadge } from './ConfidenceIndicator';
import { TransactionDetailsModal } from './TransactionDetailsModal';
import type { CashTransaction, CashClearingSuggestion, ProcessorPattern, GLPattern } from '../../lib/types';

export interface TransactionApprovalQueueProps {
  transactions: CashTransaction[];
  suggestions: CashClearingSuggestion[];
  patterns?: ProcessorPattern[];
  glMappings?: GLPattern[];
  onApprove?: (suggestionId: string, reason?: string) => Promise<void>;
  onReject?: (suggestionId: string, reason: string) => Promise<void>;
  onBatchApprove?: (suggestionIds: string[]) => Promise<void>;
  onBatchReject?: (suggestionIds: string[], reason: string) => Promise<void>;
  isLoading?: boolean;
  className?: string;
}

interface TransactionWithSuggestion extends Omit<CashTransaction, 'pattern'> {
  pattern: string; // Keep the original string pattern
  suggestion?: CashClearingSuggestion;
  processorPattern?: ProcessorPattern; // Renamed to avoid conflict
  glMapping?: GLPattern;
}

export function TransactionApprovalQueue({
  transactions,
  suggestions,
  patterns = [],
  glMappings = [],
  onApprove,
  onReject,
  onBatchApprove,
  onBatchReject,
  isLoading = false,
  className = ''
}: TransactionApprovalQueueProps) {
  const [selectedTransactions, setSelectedTransactions] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'confidence'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterByConfidence, setFilterByConfidence] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [filterByStatus, setFilterByStatus] = useState<'all' | 'pending' | 'requires_approval'>('requires_approval');
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionWithSuggestion | null>(null);
  const [showBatchRejectForm, setShowBatchRejectForm] = useState(false);
  const [batchRejectReason, setBatchRejectReason] = useState('');

  // Combine transactions with their suggestions
  const transactionsWithSuggestions = useMemo((): TransactionWithSuggestion[] => {
    return transactions.map(transaction => {
      const suggestion = suggestions.find(s => s.transaction_id === transaction.transaction_id);
      const pattern = patterns.find(p => p.pattern_id === suggestion?.pattern_matched);
      const glMapping = glMappings.find(gl => gl.gl_account_code === suggestion?.gl_account_code);
      
      return {
        ...transaction,
        suggestion,
        processorPattern: pattern,
        glMapping
      };
    });
  }, [transactions, suggestions, patterns, glMappings]);

  // Filter and sort transactions
  const filteredAndSortedTransactions = useMemo(() => {
    let filtered = transactionsWithSuggestions;

    // Filter by status
    if (filterByStatus !== 'all') {
      filtered = filtered.filter(t => {
        if (filterByStatus === 'pending') {
          return t.suggestion?.approval_status === 'PENDING';
        }
        return t.suggestion?.approval_status === 'PENDING' || t.suggestion?.approval_status === 'REJECTED';
      });
    }

    // Filter by confidence
    if (filterByConfidence !== 'all') {
      filtered = filtered.filter(t => {
        if (!t.suggestion) return false;
        const confidence = t.suggestion.confidence_score;
        switch (filterByConfidence) {
          case 'high': return confidence >= 0.85;
          case 'medium': return confidence >= 0.6 && confidence < 0.85;
          case 'low': return confidence < 0.6;
          default: return true;
        }
      });
    }

    // Sort
    return filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'date':
          comparison = new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime();
          break;
        case 'amount':
          comparison = a.amount - b.amount;
          break;
        case 'confidence':
          comparison = (a.suggestion?.confidence_score || 0) - (b.suggestion?.confidence_score || 0);
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [transactionsWithSuggestions, sortBy, sortOrder, filterByConfidence, filterByStatus]);

  const formatCurrency = (amount: number, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  const handleSelectAll = () => {
    if (selectedTransactions.size === filteredAndSortedTransactions.length) {
      setSelectedTransactions(new Set());
    } else {
      setSelectedTransactions(new Set(filteredAndSortedTransactions.map(t => t.transaction_id)));
    }
  };

  const handleSelectTransaction = (transactionId: string) => {
    const newSelected = new Set(selectedTransactions);
    if (newSelected.has(transactionId)) {
      newSelected.delete(transactionId);
    } else {
      newSelected.add(transactionId);
    }
    setSelectedTransactions(newSelected);
  };

  const handleBatchApprove = async () => {
    if (onBatchApprove && selectedTransactions.size > 0) {
      const suggestionIds = Array.from(selectedTransactions)
        .map(id => filteredAndSortedTransactions.find(t => t.transaction_id === id)?.suggestion?.suggestion_id)
        .filter(Boolean) as string[];
      
      await onBatchApprove(suggestionIds);
      setSelectedTransactions(new Set());
    }
  };

  const handleBatchReject = async () => {
    if (onBatchReject && selectedTransactions.size > 0 && batchRejectReason.trim()) {
      const suggestionIds = Array.from(selectedTransactions)
        .map(id => filteredAndSortedTransactions.find(t => t.transaction_id === id)?.suggestion?.suggestion_id)
        .filter(Boolean) as string[];
      
      await onBatchReject(suggestionIds, batchRejectReason);
      setSelectedTransactions(new Set());
      setBatchRejectReason('');
      setShowBatchRejectForm(false);
    }
  };

  if (filteredAndSortedTransactions.length === 0) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center ${className}`}>
        <div className="w-12 h-12 mx-auto mb-4 text-gray-400 dark:text-gray-500">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No transactions pending approval</h3>
        <p className="text-gray-600 dark:text-gray-400">All transactions have been processed.</p>
      </div>
    );
  }

  const baseClasses = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm";
  const containerClasses = `${baseClasses} ${className}`;

  return (
    <div className={containerClasses}>
      {/* Header with filters and actions */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Transaction Approval Queue
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {filteredAndSortedTransactions.length} transactions pending review
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Filters */}
            <select
              value={filterByStatus}
              onChange={(e) => setFilterByStatus(e.target.value as any)}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="requires_approval">Requires Approval</option>
            </select>
            
            <select
              value={filterByConfidence}
              onChange={(e) => setFilterByConfidence(e.target.value as any)}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="all">All Confidence</option>
              <option value="high">High (85%+)</option>
              <option value="medium">Medium (60-84%)</option>
              <option value="low">Low (&lt;60%)</option>
            </select>
            
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [newSortBy, newSortOrder] = e.target.value.split('-');
                setSortBy(newSortBy as any);
                setSortOrder(newSortOrder as any);
              }}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="date-desc">Date (Newest)</option>
              <option value="date-asc">Date (Oldest)</option>
              <option value="amount-desc">Amount (Highest)</option>
              <option value="amount-asc">Amount (Lowest)</option>
              <option value="confidence-desc">Confidence (Highest)</option>
              <option value="confidence-asc">Confidence (Lowest)</option>
            </select>
          </div>
        </div>
        
        {/* Batch Actions */}
        {selectedTransactions.size > 0 && (
          <div className="mt-4 flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
            <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
              {selectedTransactions.size} transactions selected
            </span>
            <div className="flex space-x-2">
              {!showBatchRejectForm ? (
                <>
                  <button
                    onClick={() => setShowBatchRejectForm(true)}
                    disabled={isLoading}
                    className="px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 rounded-md hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50 transition-colors"
                  >
                    Reject Selected
                  </button>
                  <button
                    onClick={handleBatchApprove}
                    disabled={isLoading}
                    className="px-3 py-1.5 text-sm font-medium text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30 rounded-md hover:bg-green-200 dark:hover:bg-green-900/50 disabled:opacity-50 transition-colors"
                  >
                    Approve Selected
                  </button>
                </>
              ) : (
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={batchRejectReason}
                    onChange={(e) => setBatchRejectReason(e.target.value)}
                    placeholder="Rejection reason..."
                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <button
                    onClick={() => {
                      setShowBatchRejectForm(false);
                      setBatchRejectReason('');
                    }}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBatchReject}
                    disabled={isLoading || !batchRejectReason.trim()}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Confirm
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
            <tr>
              <th scope="col" className="px-6 py-3">
                <input
                  type="checkbox"
                  checked={selectedTransactions.size === filteredAndSortedTransactions.length && filteredAndSortedTransactions.length > 0}
                  onChange={handleSelectAll}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
              </th>
              <th scope="col" className="px-6 py-3">Transaction</th>
              <th scope="col" className="px-6 py-3">Amount</th>
              <th scope="col" className="px-6 py-3">Date</th>
              <th scope="col" className="px-6 py-3">Pattern</th>
              <th scope="col" className="px-6 py-3">GL Account</th>
              <th scope="col" className="px-6 py-3">Confidence</th>
              <th scope="col" className="px-6 py-3">Status</th>
              <th scope="col" className="px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedTransactions.map((transaction, index) => (
              <tr
                key={transaction.transaction_id}
                className={`${
                  index % 2 === 0
                    ? 'bg-white dark:bg-gray-900'
                    : 'bg-gray-50 dark:bg-gray-800'
                } border-b dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer`}
                onClick={() => setSelectedTransaction(transaction)}
              >
                <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedTransactions.has(transaction.transaction_id)}
                    onChange={() => handleSelectTransaction(transaction.transaction_id)}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                </td>
                <td className="px-6 py-4">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white truncate">
                      {transaction.transaction_id.substring(0, 8)}...
                    </div>
                    <div className="text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                      {transaction.description}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 font-semibold text-gray-900 dark:text-white">
                  {formatCurrency(transaction.amount, transaction.currency_code)}
                </td>
                <td className="px-6 py-4">
                  {format(new Date(transaction.transaction_date), 'MMM dd, yyyy')}
                </td>
                <td className="px-6 py-4">
                  <span className="text-gray-900 dark:text-white">
                    {transaction.pattern}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {transaction.suggestion?.gl_account_code && (
                    <div>
                      <div className="font-mono text-gray-900 dark:text-white">
                        {transaction.suggestion.gl_account_code}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {transaction.suggestion.debit_credit_indicator}
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-6 py-4">
                  {transaction.suggestion?.confidence_score && (
                    <ConfidenceBadge
                      confidence={transaction.suggestion.confidence_score}
                      size="sm"
                    />
                  )}
                </td>
                <td className="px-6 py-4">
                  {transaction.suggestion && (
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      transaction.suggestion.approval_status === 'PENDING'
                        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                        : transaction.suggestion.approval_status === 'APPROVED'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                        : transaction.suggestion.approval_status === 'REJECTED'
                        ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                    }`}>
                      {transaction.suggestion.approval_status.replace('_', ' ')}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                  {transaction.suggestion?.approval_status === 'PENDING' && (
                    <div className="flex space-x-2">
                      <button
                        onClick={() => onReject?.(transaction.suggestion!.suggestion_id!, 'Manual rejection')}
                        disabled={isLoading}
                        className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
                        title="Reject"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                      <button
                        onClick={() => onApprove?.(transaction.suggestion!.suggestion_id!)}
                        disabled={isLoading}
                        className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 disabled:opacity-50"
                        title="Approve"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Transaction Details Modal */}
      <TransactionDetailsModal
        transaction={selectedTransaction}
        suggestion={selectedTransaction?.suggestion}
        pattern={selectedTransaction?.processorPattern}
        glMapping={selectedTransaction?.glMapping}
        isOpen={!!selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
        onApprove={async (suggestionId, reason) => {
          await onApprove?.(suggestionId, reason);
          setSelectedTransaction(null);
        }}
        onReject={async (suggestionId, reason) => {
          await onReject?.(suggestionId, reason);
          setSelectedTransaction(null);
        }}
        isLoading={isLoading}
      />
    </div>
  );
}