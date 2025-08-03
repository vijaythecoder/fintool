'use client';

import React, { useState, useMemo } from 'react';
import { ConfidenceIndicator } from './ConfidenceIndicator';
import type { ProcessorPattern, CashClearingSuggestion, CashTransaction } from '../../lib/types';

export interface PatternMatchReview {
  pattern: ProcessorPattern;
  suggestions: {
    suggestion: CashClearingSuggestion;
    transaction: CashTransaction;
    matchStrength: number;
    matchDetails: string;
  }[];
  overallConfidence: number;
  reviewStatus: 'pending' | 'approved' | 'rejected';
}

export interface PatternMatchingReviewProps {
  patternReviews: PatternMatchReview[];
  onApprovePattern?: (patternId: string, reason?: string) => Promise<void>;
  onRejectPattern?: (patternId: string, reason: string) => Promise<void>;
  onUpdatePattern?: (patternId: string, updates: Partial<ProcessorPattern>) => Promise<void>;
  isLoading?: boolean;
  className?: string;
}

export function PatternMatchingReview({
  patternReviews,
  onApprovePattern,
  onRejectPattern,
  onUpdatePattern,
  isLoading = false,
  className = ''
}: PatternMatchingReviewProps) {
  const [expandedPatterns, setExpandedPatterns] = useState<Set<string>>(new Set());
  const [filterByStatus, setFilterByStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [filterByType, setFilterByType] = useState<'all' | 'REFERENCE' | 'AMOUNT' | 'DESCRIPTION' | 'COMPOSITE'>('all');
  const [sortBy, setSortBy] = useState<'confidence' | 'count' | 'name'>('confidence');
  const [showRejectionModal, setShowRejectionModal] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Filter and sort reviews
  const filteredAndSortedReviews = useMemo(() => {
    let filtered = patternReviews;

    // Filter by status
    if (filterByStatus !== 'all') {
      filtered = filtered.filter(review => review.reviewStatus === filterByStatus);
    }

    // Filter by type
    if (filterByType !== 'all') {
      filtered = filtered.filter(review => review.pattern.pattern_type === filterByType);
    }

    // Sort
    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'confidence':
          return b.overallConfidence - a.overallConfidence;
        case 'count':
          return b.suggestions.length - a.suggestions.length;
        case 'name':
          return a.pattern.pattern_name.localeCompare(b.pattern.pattern_name);
        default:
          return 0;
      }
    });
  }, [patternReviews, filterByStatus, filterByType, sortBy]);

  const toggleExpanded = (patternId: string) => {
    const newExpanded = new Set(expandedPatterns);
    if (newExpanded.has(patternId)) {
      newExpanded.delete(patternId);
    } else {
      newExpanded.add(patternId);
    }
    setExpandedPatterns(newExpanded);
  };

  const handleApprove = async (patternId: string) => {
    if (onApprovePattern) {
      await onApprovePattern(patternId);
    }
  };

  const handleReject = async (patternId: string) => {
    if (onRejectPattern && rejectionReason) {
      await onRejectPattern(patternId, rejectionReason);
      setShowRejectionModal(null);
      setRejectionReason('');
    }
  };

  const getPatternTypeIcon = (type: string) => {
    const iconClass = "w-4 h-4";
    switch (type) {
      case 'REFERENCE':
        return (
          <svg className={iconClass} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm2 5a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm8-3a1 1 0 01-1 1H7a1 1 0 010-2h6a1 1 0 011 1zM7 13a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
          </svg>
        );
      case 'AMOUNT':
        return (
          <svg className={iconClass} viewBox="0 0 20 20" fill="currentColor">
            <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.51-1.31c-.562-.649-1.413-1.076-2.353-1.253V5z" clipRule="evenodd" />
          </svg>
        );
      case 'DESCRIPTION':
        return (
          <svg className={iconClass} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        );
      case 'COMPOSITE':
        return (
          <svg className={iconClass} viewBox="0 0 20 20" fill="currentColor">
            <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
          </svg>
        );
      default:
        return (
          <svg className={iconClass} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  const getPatternTypeColor = (type: string) => {
    switch (type) {
      case 'REFERENCE': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400';
      case 'AMOUNT': return 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400';
      case 'DESCRIPTION': return 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400';
      case 'COMPOSITE': return 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400';
      default: return 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400';
    }
  };

  if (filteredAndSortedReviews.length === 0) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center ${className}`}>
        <div className="w-12 h-12 mx-auto mb-4 text-gray-400 dark:text-gray-500">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No patterns to review</h3>
        <p className="text-gray-600 dark:text-gray-400">All pattern matches have been processed.</p>
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
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Pattern Matching Review</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Review AI-identified patterns for transaction classification
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
              value={filterByType}
              onChange={(e) => setFilterByType(e.target.value as any)}
              className="text-sm border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-gray-300"
            >
              <option value="all">All Types</option>
              <option value="REFERENCE">Reference</option>
              <option value="AMOUNT">Amount</option>
              <option value="DESCRIPTION">Description</option>
              <option value="COMPOSITE">Composite</option>
            </select>
            
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-sm border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-gray-300"
            >
              <option value="confidence">Sort by Confidence</option>
              <option value="count">Sort by Count</option>
              <option value="name">Sort by Name</option>
            </select>
          </div>
        </div>
      </div>

      {/* Pattern List */}
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {filteredAndSortedReviews.map((review) => (
          <div key={review.pattern.pattern_id} className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full ${getPatternTypeColor(review.pattern.pattern_type)}`}>
                    {getPatternTypeIcon(review.pattern.pattern_type)}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <h3 className="text-base font-medium text-gray-900 dark:text-gray-100">
                        {review.pattern.pattern_name}
                      </h3>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPatternTypeColor(review.pattern.pattern_type)}`}>
                        {review.pattern.pattern_type}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
                      <span>{review.suggestions.length} matches</span>
                      <span>•</span>
                      <span>Weight: {review.pattern.confidence_weight}</span>
                      {review.pattern.pattern_regex && (
                        <>
                          <span>•</span>
                          <span className="font-mono text-xs">{review.pattern.pattern_regex}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <ConfidenceIndicator confidence={review.overallConfidence} showLabel />
                  
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => toggleExpanded(review.pattern.pattern_id || '')}
                      className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-500"
                    >
                      {expandedPatterns.has(review.pattern.pattern_id || '') ? 'Hide' : 'Show'} Matches
                    </button>
                    
                    {review.reviewStatus === 'pending' && (
                      <>
                        <button
                          onClick={() => handleApprove(review.pattern.pattern_id || '')}
                          disabled={isLoading}
                          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setShowRejectionModal(review.pattern.pattern_id || '')}
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

            {/* Expanded Match Details */}
            {expandedPatterns.has(review.pattern.pattern_id || '') && (
              <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                  Sample Matches ({Math.min(5, review.suggestions.length)} of {review.suggestions.length})
                </h4>
                <div className="space-y-2">
                  {review.suggestions.slice(0, 5).map(({ suggestion, transaction, matchStrength, matchDetails }) => (
                    <div key={suggestion.suggestion_id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                      <div className="flex-1">
                        <p className="text-sm text-gray-900 dark:text-gray-100">
                          {transaction.description}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          ID: {transaction.transaction_id} • ${transaction.amount.toLocaleString()} • {matchDetails}
                        </p>
                      </div>
                      <div className="ml-4 flex items-center space-x-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Match:</span>
                        <ConfidenceIndicator confidence={matchStrength} size="sm" />
                      </div>
                    </div>
                  ))}
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
              Reject Pattern
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