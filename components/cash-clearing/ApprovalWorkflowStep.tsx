'use client';

import React, { useState } from 'react';
import { ConfidenceIndicator } from './ConfidenceIndicator';

export interface ApprovalWorkflowStepProps {
  stepNumber: 1 | 2 | 3 | 4;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'requires_approval';
  confidence?: number;
  itemCount?: number;
  pendingCount?: number;
  children?: React.ReactNode;
  onApprove?: () => void;
  onReject?: () => void;
  onReview?: () => void;
  isCollapsible?: boolean;
  defaultExpanded?: boolean;
  processingTime?: number;
  errorMessage?: string;
  className?: string;
}

export function ApprovalWorkflowStep({
  stepNumber,
  title,
  description,
  status,
  confidence,
  itemCount,
  pendingCount,
  children,
  onApprove,
  onReject,
  onReview,
  isCollapsible = true,
  defaultExpanded = false,
  processingTime,
  errorMessage,
  className = ''
}: ApprovalWorkflowStepProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded || status === 'requires_approval' || status === 'in_progress');

  const getStatusConfig = () => {
    switch (status) {
      case 'completed':
        return {
          icon: (
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          ),
          color: 'text-green-600 dark:text-green-400',
          bgColor: 'bg-green-100 dark:bg-green-900/30',
          borderColor: 'border-green-200 dark:border-green-800',
          label: 'Completed'
        };
      case 'in_progress':
        return {
          icon: (
            <div className="animate-spin w-5 h-5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 11-6.219-8.56"/>
              </svg>
            </div>
          ),
          color: 'text-blue-600 dark:text-blue-400',
          bgColor: 'bg-blue-100 dark:bg-blue-900/30',
          borderColor: 'border-blue-200 dark:border-blue-800',
          label: 'In Progress'
        };
      case 'requires_approval':
        return {
          icon: (
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          ),
          color: 'text-amber-600 dark:text-amber-400',
          bgColor: 'bg-amber-100 dark:bg-amber-900/30',
          borderColor: 'border-amber-200 dark:border-amber-800',
          label: 'Requires Approval'
        };
      case 'failed':
        return {
          icon: (
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          ),
          color: 'text-red-600 dark:text-red-400',
          bgColor: 'bg-red-100 dark:bg-red-900/30',
          borderColor: 'border-red-200 dark:border-red-800',
          label: 'Failed'
        };
      default: // pending
        return {
          icon: (
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
          ),
          color: 'text-gray-600 dark:text-gray-400',
          bgColor: 'bg-gray-100 dark:bg-gray-800',
          borderColor: 'border-gray-200 dark:border-gray-700',
          label: 'Pending'
        };
    }
  };

  const statusConfig = getStatusConfig();

  const formatProcessingTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const getStepIcon = () => {
    return (
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm ${
        status === 'completed' ? 'bg-green-500' :
        status === 'in_progress' ? 'bg-blue-500' :
        status === 'requires_approval' ? 'bg-amber-500' :
        status === 'failed' ? 'bg-red-500' :
        'bg-gray-400'
      }`}>
        {status === 'completed' ? '✓' : stepNumber}
      </div>
    );
  };

  return (
    <div className={`bg-white dark:bg-gray-800 border ${statusConfig.borderColor} rounded-lg shadow-sm hover:shadow-md transition-all duration-200 ${className}`}>
      {/* Header */}
      <div 
        className={`px-6 py-4 ${isCollapsible ? 'cursor-pointer' : ''}`}
        onClick={() => isCollapsible && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {/* Step Number/Icon */}
            {getStepIcon()}
            
            {/* Step Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-3">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {title}
                </h3>
                
                {/* Status Badge */}
                <div className={`flex items-center space-x-2 px-3 py-1 rounded-full ${statusConfig.bgColor}`}>
                  <div className={statusConfig.color}>
                    {statusConfig.icon}
                  </div>
                  <span className={`text-sm font-medium ${statusConfig.color}`}>
                    {statusConfig.label}
                  </span>
                </div>
                
                {/* Confidence Indicator */}
                {confidence !== undefined && (
                  <ConfidenceIndicator
                    confidence={confidence}
                    size="sm"
                    showPercentage={true}
                  />
                )}
              </div>
              
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {description}
              </p>
              
              {/* Metrics */}
              <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                {itemCount !== undefined && (
                  <span>{itemCount} items</span>
                )}
                {pendingCount !== undefined && pendingCount > 0 && (
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    {pendingCount} pending approval
                  </span>
                )}
                {processingTime !== undefined && (
                  <span>Processed in {formatProcessingTime(processingTime)}</span>
                )}
              </div>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="flex items-center space-x-2">
            {status === 'requires_approval' && (
              <div className="flex space-x-2">
                {onReview && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onReview();
                    }}
                    className="px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 rounded-md hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                  >
                    Review
                  </button>
                )}
                {onReject && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onReject();
                    }}
                    className="px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 rounded-md hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                  >
                    Reject
                  </button>
                )}
                {onApprove && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onApprove();
                    }}
                    className="px-3 py-1.5 text-sm font-medium text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30 rounded-md hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                  >
                    Approve
                  </button>
                )}
              </div>
            )}
            
            {/* Collapse Toggle */}
            {isCollapsible && (
              <div className={`w-5 h-5 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${
                isExpanded ? 'rotate-180' : ''
              }`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Error Message */}
      {errorMessage && (
        <div className="px-6 py-3 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 text-red-500">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <span className="text-red-700 dark:text-red-300 text-sm">{errorMessage}</span>
          </div>
        </div>
      )}
      
      {/* Expandable Content */}
      {children && (
        <div className={`
          overflow-hidden transition-all duration-300 ease-in-out
          ${isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}
        `}>
          <div className="border-t border-gray-100 dark:border-gray-700">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}