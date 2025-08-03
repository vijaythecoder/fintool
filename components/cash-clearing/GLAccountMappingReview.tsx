'use client';

import React, { useState, useMemo } from 'react';
import { ConfidenceIndicator, ConfidenceBadge } from './ConfidenceIndicator';
import type { GLPattern, CashClearingSuggestion, CashTransaction } from '../../lib/types';

export interface GLMappingReview {
  glPattern: GLPattern;
  suggestions: {
    suggestion: CashClearingSuggestion;
    transaction: CashTransaction;
    mappingConfidence: number;
    validationIssues?: string[];
  }[];
  overallConfidence: number;
  reviewStatus: 'pending' | 'approved' | 'rejected';
  businessImpact: {
    totalAmount: number;
    transactionCount: number;
    businessUnits: string[];
    costCenters: string[];
  };
}

export interface GLAccountMappingReviewProps {
  glMappingReviews: GLMappingReview[];
  onApproveMapping?: (glPatternId: string, reason?: string) => Promise<void>;
  onRejectMapping?: (glPatternId: string, reason: string) => Promise<void>;
  onApproveSuggestion?: (suggestionId: string) => Promise<void>;
  onRejectSuggestion?: (suggestionId: string, reason: string) => Promise<void>;
  onUpdateGLMapping?: (glPatternId: string, updates: Partial<GLPattern>) => Promise<void>;
  isLoading?: boolean;
  className?: string;
}

export function GLAccountMappingReview({
  glMappingReviews,
  onApproveMapping,
  onRejectMapping,
  onApproveSuggestion,
  onRejectSuggestion,
  onUpdateGLMapping,
  isLoading = false,
  className = ''
}: GLAccountMappingReviewProps) {
  const [expandedMappings, setExpandedMappings] = useState<Set<string>>(new Set());
  const [filterByStatus, setFilterByStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [filterByCategory, setFilterByCategory] = useState<'all' | 'ASSET' | 'LIABILITY' | 'REVENUE' | 'EXPENSE'>('all');
  const [filterByConfidence, setFilterByConfidence] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [sortBy, setSortBy] = useState<'confidence' | 'amount' | 'count' | 'account'>('confidence');
  const [showRejectionModal, setShowRejectionModal] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Filter and sort reviews
  const filteredAndSortedReviews = useMemo(() => {
    let filtered = glMappingReviews;

    // Filter by status
    if (filterByStatus !== 'all') {
      filtered = filtered.filter(review => review.reviewStatus === filterByStatus);
    }

    // Filter by category
    if (filterByCategory !== 'all') {
      filtered = filtered.filter(review => review.glPattern.account_category === filterByCategory);
    }

    // Filter by confidence
    if (filterByConfidence !== 'all') {
      filtered = filtered.filter(review => {
        if (filterByConfidence === 'high') return review.overallConfidence >= 0.8;
        if (filterByConfidence === 'medium') return review.overallConfidence >= 0.6 && review.overallConfidence < 0.8;
        if (filterByConfidence === 'low') return review.overallConfidence < 0.6;
        return true;
      });
    }

    // Sort
    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'confidence':
          return b.overallConfidence - a.overallConfidence;
        case 'amount':
          return b.businessImpact.totalAmount - a.businessImpact.totalAmount;
        case 'count':
          return b.businessImpact.transactionCount - a.businessImpact.transactionCount;
        case 'account':
          return a.glPattern.gl_account_code.localeCompare(b.glPattern.gl_account_code);
        default:
          return 0;
      }
    });
  }, [glMappingReviews, filterByStatus, filterByCategory, filterByConfidence, sortBy]);

  const toggleExpanded = (glPatternId: string) => {
    const newExpanded = new Set(expandedMappings);
    if (newExpanded.has(glPatternId)) {
      newExpanded.delete(glPatternId);
    } else {
      newExpanded.add(glPatternId);
    }
    setExpandedMappings(newExpanded);
  };

  const handleApprove = async (glPatternId: string) => {
    if (onApproveMapping) {
      await onApproveMapping(glPatternId);
    }
  };

  const handleReject = async (glPatternId: string) => {
    if (onRejectMapping && rejectionReason) {
      await onRejectMapping(glPatternId, rejectionReason);
      setShowRejectionModal(null);
      setRejectionReason('');
    }
  };

  const getCategoryIcon = (category: string) => {
    const iconClass = "w-4 h-4";
    switch (category) {
      case 'ASSET':
        return (
          <svg className={iconClass} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h4a2 2 0 012 2v2a2 2 0 01-2 2H8a2 2 0 01-2-2v-2z" clipRule="evenodd" />
          </svg>
        );
      case 'LIABILITY':
        return (
          <svg className={iconClass} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V4a2 2 0 00-2-2H6zm1 2a1 1 0 000 2h6a1 1 0 100-2H7zm6 7a1 1 0 011 1v3a1 1 0 11-2 0v-3a1 1 0 011-1zm-3 3a1 1 0 100 2h.01a1 1 0 100-2H10zm-4 1a1 1 0 011-1h.01a1 1 0 110 2H7a1 1 0 01-1-1zm1-4a1 1 0 100 2h.01a1 1 0 100-2H7zm2 1a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1zm4-4a1 1 0 100 2h.01a1 1 0 100-2H13zM9 9a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1zM7 8a1 1 0 000 2h.01a1 1 0 000-2H7z" clipRule="evenodd" />
          </svg>
        );
      case 'REVENUE':
        return (
          <svg className={iconClass} viewBox="0 0 20 20" fill="currentColor">
            <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.51-1.31c-.562-.649-1.413-1.076-2.353-1.253V5z" clipRule="evenodd" />
          </svg>
        );
      case 'EXPENSE':
        return (
          <svg className={iconClass} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
          </svg>
        );
      default:
        return (
          <svg className={iconClass} viewBox="0 0 20 20" fill="currentColor">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'ASSET': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400';
      case 'LIABILITY': return 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400';
      case 'REVENUE': return 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400';
      case 'EXPENSE': return 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400';
      default: return 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400';
    }
  };

  if (filteredAndSortedReviews.length === 0) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center ${className}`}>
        <div className="w-12 h-12 mx-auto mb-4 text-gray-400 dark:text-gray-500">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No GL mappings to review</h3>
        <p className="text-gray-600 dark:text-gray-400">All GL account mappings have been processed.</p>
      </div>
    );
  }

  const baseClasses = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm";
  const containerClasses = `${baseClasses} ${className}`;

  return (
    <div className={containerClasses}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
          <div>
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">GL Account Mapping Review</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Review and approve GL account mappings for pattern matches
            </p>
          </div>
          
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <select
              value={filterByStatus}
              onChange={(e) => setFilterByStatus(e.target.value as any)}
              className="text-sm border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-gray-300"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            
            <select
              value={filterByCategory}
              onChange={(e) => setFilterByCategory(e.target.value as any)}
              className="text-sm border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-gray-300"
            >
              <option value="all">All Categories</option>
              <option value="ASSET">Asset</option>
              <option value="LIABILITY">Liability</option>
              <option value="REVENUE">Revenue</option>
              <option value="EXPENSE">Expense</option>
            </select>
            
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-sm border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-gray-300"
            >
              <option value="confidence">Sort by Confidence</option>
              <option value="amount">Sort by Amount</option>
              <option value="count">Sort by Count</option>
              <option value="account">Sort by Account</option>
            </select>
          </div>
        </div>
      </div>

      {/* Mappings List */}
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {filteredAndSortedReviews.map((review) => (
          <div key={review.glPattern.gl_pattern_id} className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full ${getCategoryColor(review.glPattern.account_category)}`}>
                    {getCategoryIcon(review.glPattern.account_category)}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <h3 className="text-base font-medium text-gray-900 dark:text-gray-100">
                        {review.glPattern.gl_account_code} - {review.glPattern.gl_account_name}
                      </h3>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(review.glPattern.account_category)}`}>
                        {review.glPattern.account_category}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
                      <span>Pattern: {review.glPattern.pattern_id}</span>
                      <span>•</span>
                      <span>{review.businessImpact.transactionCount} transactions</span>
                      <span>•</span>
                      <span>${review.businessImpact.totalAmount.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <ConfidenceIndicator confidence={review.overallConfidence} showLabel />
                  
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => toggleExpanded(review.glPattern.gl_pattern_id || '')}
                      className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-500"
                    >
                      {expandedMappings.has(review.glPattern.gl_pattern_id || '') ? 'Hide' : 'Show'} Details
                    </button>
                    
                    {review.reviewStatus === 'pending' && (
                      <>
                        <button
                          onClick={() => handleApprove(review.glPattern.gl_pattern_id || '')}
                          disabled={isLoading}
                          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setShowRejectionModal(review.glPattern.gl_pattern_id || '')}
                          disabled={isLoading}
                          className="inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-xs font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Expanded Details */}
            {expandedMappings.has(review.glPattern.gl_pattern_id || '') && (
              <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Debit/Credit:</span>
                      <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                        {review.glPattern.debit_credit_indicator}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Auto-approve threshold:</span>
                      <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                        {(review.glPattern.auto_approve_threshold * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                      Related Suggestions ({review.suggestions.length})
                    </h4>
                    <div className="space-y-2">
                      {review.suggestions.slice(0, 5).map(({ suggestion, transaction }) => (
                        <div key={suggestion.suggestion_id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                          <div className="flex-1">
                            <p className="text-sm text-gray-900 dark:text-gray-100">
                              {transaction.description}
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              ID: {transaction.transaction_id} • ${transaction.amount.toLocaleString()}
                            </p>
                          </div>
                          <ConfidenceBadge confidence={suggestion.confidence_score} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Rejection Modal */}
      {showRejectionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
              Reject GL Mapping
            </h3>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Please provide a reason for rejection..."
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-gray-300"
              rows={4}
            />
            <div className="mt-4 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowRejectionModal(null);
                  setRejectionReason('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={() => handleReject(showRejectionModal)}
                disabled={!rejectionReason || isLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}