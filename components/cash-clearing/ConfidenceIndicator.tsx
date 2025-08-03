'use client';

import React from 'react';

export interface ConfidenceIndicatorProps {
  confidence: number;
  size?: 'sm' | 'md' | 'lg';
  showPercentage?: boolean;
  showLabel?: boolean;
  className?: string;
  thresholds?: {
    high: number;
    medium: number;
  };
}

export function ConfidenceIndicator({
  confidence,
  size = 'md',
  showPercentage = true,
  showLabel = false,
  className = '',
  thresholds = { high: 0.85, medium: 0.6 }
}: ConfidenceIndicatorProps) {
  const percentage = Math.round(confidence * 100);
  
  const getConfidenceLevel = () => {
    if (confidence >= thresholds.high) return 'high';
    if (confidence >= thresholds.medium) return 'medium';
    return 'low';
  };

  const confidenceLevel = getConfidenceLevel();

  const sizeClasses = {
    sm: {
      bar: 'h-1.5',
      container: 'w-16',
      text: 'text-xs',
      icon: 'w-3 h-3'
    },
    md: {
      bar: 'h-2',
      container: 'w-24',
      text: 'text-sm',
      icon: 'w-4 h-4'
    },
    lg: {
      bar: 'h-3',
      container: 'w-32',
      text: 'text-base',
      icon: 'w-5 h-5'
    }
  };

  const colorClasses = {
    high: {
      bg: 'bg-green-500',
      text: 'text-green-700 dark:text-green-300',
      bgLight: 'bg-green-100 dark:bg-green-900/30'
    },
    medium: {
      bg: 'bg-yellow-500',
      text: 'text-yellow-700 dark:text-yellow-300',
      bgLight: 'bg-yellow-100 dark:bg-yellow-900/30'
    },
    low: {
      bg: 'bg-red-500',
      text: 'text-red-700 dark:text-red-300',
      bgLight: 'bg-red-100 dark:bg-red-900/30'
    }
  };

  const getConfidenceIcon = () => {
    const iconClass = `${sizeClasses[size].icon} ${colorClasses[confidenceLevel].text}`;
    
    switch (confidenceLevel) {
      case 'high':
        return (
          <svg viewBox="0 0 20 20" fill="currentColor" className={iconClass}>
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      case 'medium':
        return (
          <svg viewBox="0 0 20 20" fill="currentColor" className={iconClass}>
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
      case 'low':
        return (
          <svg viewBox="0 0 20 20" fill="currentColor" className={iconClass}>
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  const getConfidenceLabel = () => {
    switch (confidenceLevel) {
      case 'high': return 'High Confidence';
      case 'medium': return 'Medium Confidence';
      case 'low': return 'Low Confidence';
    }
  };

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      {/* Icon */}
      {getConfidenceIcon()}
      
      {/* Progress Bar */}
      <div className="flex-1">
        <div className={`${sizeClasses[size].container} bg-gray-200 dark:bg-gray-700 rounded-full ${sizeClasses[size].bar}`}>
          <div
            className={`${sizeClasses[size].bar} rounded-full transition-all duration-300 ${colorClasses[confidenceLevel].bg}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
      
      {/* Percentage */}
      {showPercentage && (
        <span className={`${sizeClasses[size].text} font-medium ${colorClasses[confidenceLevel].text} min-w-[2.5rem] text-right`}>
          {percentage}%
        </span>
      )}
      
      {/* Label */}
      {showLabel && (
        <span className={`${sizeClasses[size].text} font-medium ${colorClasses[confidenceLevel].text}`}>
          {getConfidenceLabel()}
        </span>
      )}
    </div>
  );
}

// Badge variant for compact display
export function ConfidenceBadge({
  confidence,
  size = 'sm',
  thresholds = { high: 0.85, medium: 0.6 }
}: Pick<ConfidenceIndicatorProps, 'confidence' | 'size' | 'thresholds'>) {
  const percentage = Math.round(confidence * 100);
  const confidenceLevel = confidence >= thresholds.high ? 'high' : 
                         confidence >= thresholds.medium ? 'medium' : 'low';

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base'
  };

  const colorClasses = {
    high: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    low: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
  };

  return (
    <span className={`inline-flex items-center font-medium rounded-full ${sizeClasses[size]} ${colorClasses[confidenceLevel]}`}>
      {percentage}%
    </span>
  );
}