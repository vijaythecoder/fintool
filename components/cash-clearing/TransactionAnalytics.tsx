'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { format, subDays, startOfDay, endOfDay, parseISO } from 'date-fns';
import type { CashTransaction, CashClearingSuggestion } from '../../lib/types';
import type { TransactionSummary } from './hooks/useTransactionData';

export interface AnalyticsMetric {
  id: string;
  name: string;
  value: number | string;
  previousValue?: number | string;
  change?: number;
  changeType?: 'increase' | 'decrease' | 'neutral';
  format?: 'number' | 'currency' | 'percentage' | 'duration';
  description?: string;
  trend?: number[];
}

export interface ChartDataPoint {
  date: string;
  value: number;
  label?: string;
  metadata?: Record<string, any>;
}

export interface TransactionAnalyticsProps {
  transactions: CashTransaction[];
  suggestions: CashClearingSuggestion[];
  summary?: TransactionSummary;
  timeRange?: number; // days
  refreshInterval?: number; // milliseconds
  enableRealTime?: boolean;
  showTrends?: boolean;
  showComparisons?: boolean;
  className?: string;
  onMetricClick?: (metric: AnalyticsMetric) => void;
  onExport?: (data: any[], format: 'csv' | 'json') => void;
}

const DEFAULT_TIME_RANGE = 30; // 30 days

export function TransactionAnalytics({
  transactions,
  suggestions,
  summary,
  timeRange = DEFAULT_TIME_RANGE,
  refreshInterval = 30000,
  enableRealTime = false,
  showTrends = true,
  showComparisons = true,
  className = '',
  onMetricClick,
  onExport
}: TransactionAnalyticsProps) {
  const [selectedTimeRange, setSelectedTimeRange] = useState(timeRange);
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [chartType, setChartType] = useState<'line' | 'bar' | 'area'>('line');

  // Calculate date range
  const dateRange = useMemo(() => {
    const endDate = new Date();
    const startDate = subDays(endDate, selectedTimeRange);
    return { startDate, endDate };
  }, [selectedTimeRange]);

  // Filter transactions by date range
  const filteredTransactions = useMemo(() => {
    return transactions.filter(transaction => {
      const transactionDate = parseISO(transaction.transaction_date);
      return transactionDate >= dateRange.startDate && transactionDate <= dateRange.endDate;
    });
  }, [transactions, dateRange]);

  // Filter suggestions by date range
  const filteredSuggestions = useMemo(() => {
    return suggestions.filter(suggestion => {
      const transaction = transactions.find(t => t.transaction_id === suggestion.transaction_id);
      if (!transaction) return false;
      const transactionDate = parseISO(transaction.transaction_date);
      return transactionDate >= dateRange.startDate && transactionDate <= dateRange.endDate;
    });
  }, [suggestions, transactions, dateRange]);

  // Calculate analytics metrics
  const analyticsMetrics = useMemo((): AnalyticsMetric[] => {
    const metrics: AnalyticsMetric[] = [];
    
    // Total Transactions
    const totalTransactions = filteredTransactions.length;
    const previousPeriodTransactions = transactions.filter(t => {
      const date = parseISO(t.transaction_date);
      const previousStart = subDays(dateRange.startDate, selectedTimeRange);
      const previousEnd = subDays(dateRange.endDate, selectedTimeRange);
      return date >= previousStart && date <= previousEnd;
    }).length;
    
    metrics.push({
      id: 'total-transactions',
      name: 'Total Transactions',
      value: totalTransactions,
      previousValue: previousPeriodTransactions,
      change: previousPeriodTransactions > 0 ? ((totalTransactions - previousPeriodTransactions) / previousPeriodTransactions) * 100 : 0,
      changeType: totalTransactions > previousPeriodTransactions ? 'increase' : totalTransactions < previousPeriodTransactions ? 'decrease' : 'neutral',
      format: 'number',
      description: `Transactions in the last ${selectedTimeRange} days`
    });

    // Total Amount
    const totalAmount = filteredTransactions.reduce((sum, t) => sum + t.amount, 0);
    const previousAmount = transactions.filter(t => {
      const date = parseISO(t.transaction_date);
      const previousStart = subDays(dateRange.startDate, selectedTimeRange);
      const previousEnd = subDays(dateRange.endDate, selectedTimeRange);
      return date >= previousStart && date <= previousEnd;
    }).reduce((sum, t) => sum + t.amount, 0);
    
    metrics.push({
      id: 'total-amount',
      name: 'Total Amount',
      value: totalAmount,
      previousValue: previousAmount,
      change: previousAmount > 0 ? ((totalAmount - previousAmount) / previousAmount) * 100 : 0,
      changeType: totalAmount > previousAmount ? 'increase' : totalAmount < previousAmount ? 'decrease' : 'neutral',
      format: 'currency',
      description: `Transaction volume in the last ${selectedTimeRange} days`
    });

    // Average Amount
    const avgAmount = totalTransactions > 0 ? totalAmount / totalTransactions : 0;
    const previousAvgAmount = previousPeriodTransactions > 0 ? previousAmount / previousPeriodTransactions : 0;
    
    metrics.push({
      id: 'avg-amount',
      name: 'Average Amount',
      value: avgAmount,
      previousValue: previousAvgAmount,
      change: previousAvgAmount > 0 ? ((avgAmount - previousAvgAmount) / previousAvgAmount) * 100 : 0,
      changeType: avgAmount > previousAvgAmount ? 'increase' : avgAmount < previousAvgAmount ? 'decrease' : 'neutral',
      format: 'currency',
      description: 'Average transaction amount'
    });

    // Processing Success Rate
    const processedSuggestions = filteredSuggestions.filter(s => s.approval_status !== 'PENDING');
    const approvedSuggestions = filteredSuggestions.filter(s => s.approval_status === 'APPROVED' || s.approval_status === 'AUTO_APPROVED');
    const successRate = processedSuggestions.length > 0 ? (approvedSuggestions.length / processedSuggestions.length) * 100 : 0;
    
    metrics.push({
      id: 'success-rate',
      name: 'Processing Success Rate',
      value: successRate,
      format: 'percentage',
      description: 'Percentage of transactions successfully processed'
    });

    // Average Confidence Score
    const suggestionsWithConfidence = filteredSuggestions.filter(s => s.confidence_score !== undefined);
    const avgConfidence = suggestionsWithConfidence.length > 0 
      ? (suggestionsWithConfidence.reduce((sum, s) => sum + s.confidence_score, 0) / suggestionsWithConfidence.length) * 100
      : 0;
    
    metrics.push({
      id: 'avg-confidence',
      name: 'Average Confidence',
      value: avgConfidence,
      format: 'percentage',
      description: 'Average AI confidence score'
    });

    // Pending Approvals
    const pendingApprovals = filteredSuggestions.filter(s => s.approval_status === 'PENDING').length;
    
    metrics.push({
      id: 'pending-approvals',
      name: 'Pending Approvals',
      value: pendingApprovals,
      format: 'number',
      description: 'Transactions awaiting human approval',
      changeType: pendingApprovals > 0 ? 'increase' : 'neutral'
    });

    // High Risk Transactions
    const highRiskTransactions = filteredSuggestions.filter(s => {
      const transaction = transactions.find(t => t.transaction_id === s.transaction_id);
      return s.confidence_score < 0.6 || (transaction && transaction.amount > 50000);
    }).length;
    
    metrics.push({
      id: 'high-risk',
      name: 'High Risk Transactions',
      value: highRiskTransactions,
      format: 'number',
      description: 'Transactions requiring special attention',
      changeType: highRiskTransactions > 0 ? 'increase' : 'neutral'
    });

    // Auto-Approval Rate
    const autoApproved = filteredSuggestions.filter(s => s.approval_status === 'AUTO_APPROVED').length;
    const autoApprovalRate = processedSuggestions.length > 0 ? (autoApproved / processedSuggestions.length) * 100 : 0;
    
    metrics.push({
      id: 'auto-approval-rate',
      name: 'Auto-Approval Rate',
      value: autoApprovalRate,
      format: 'percentage',
      description: 'Percentage of transactions auto-approved'
    });

    return metrics;
  }, [filteredTransactions, filteredSuggestions, transactions, dateRange, selectedTimeRange]);

  // Generate chart data for trends
  const chartData = useMemo((): Record<string, ChartDataPoint[]> => {
    const data: Record<string, ChartDataPoint[]> = {};
    
    // Generate daily data points
    const days: ChartDataPoint[] = [];
    for (let i = selectedTimeRange - 1; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dateStr = format(date, 'yyyy-MM-dd');
      const dayStart = startOfDay(date);
      const dayEnd = endOfDay(date);
      
      const dayTransactions = transactions.filter(t => {
        const tDate = parseISO(t.transaction_date);
        return tDate >= dayStart && tDate <= dayEnd;
      });
      
      const daySuggestions = suggestions.filter(s => {
        const transaction = transactions.find(t => t.transaction_id === s.transaction_id);
        if (!transaction) return false;
        const tDate = parseISO(transaction.transaction_date);
        return tDate >= dayStart && tDate <= dayEnd;
      });

      days.push({
        date: dateStr,
        value: dayTransactions.length,
        label: format(date, 'MMM d'),
        metadata: {
          amount: dayTransactions.reduce((sum, t) => sum + t.amount, 0),
          suggestions: daySuggestions.length,
          avgConfidence: daySuggestions.length > 0 
            ? daySuggestions.reduce((sum, s) => sum + s.confidence_score, 0) / daySuggestions.length
            : 0
        }
      });
    }

    data['transaction-count'] = days;
    data['transaction-amount'] = days.map(d => ({
      ...d,
      value: d.metadata?.amount || 0
    }));
    data['avg-confidence'] = days.map(d => ({
      ...d,
      value: (d.metadata?.avgConfidence || 0) * 100
    }));

    return data;
  }, [transactions, suggestions, selectedTimeRange]);

  // Format metric value
  const formatMetricValue = useCallback((value: number | string, format?: string): string => {
    if (typeof value === 'string') return value;
    
    switch (format) {
      case 'currency':
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        }).format(value);
      case 'percentage':
        return `${value.toFixed(1)}%`;
      case 'duration':
        return `${value.toFixed(0)}ms`;
      case 'number':
      default:
        return new Intl.NumberFormat('en-US').format(value);
    }
  }, []);

  // Render metric card
  const renderMetricCard = useCallback((metric: AnalyticsMetric) => {
    const isSelected = selectedMetric === metric.id;
    
    return (
      <div
        key={metric.id}
        className={`bg-white dark:bg-gray-800 rounded-lg border-2 p-6 cursor-pointer transition-all hover:shadow-md ${
          isSelected 
            ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-200 dark:ring-blue-800' 
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
        }`}
        onClick={() => {
          setSelectedMetric(isSelected ? null : metric.id);
          onMetricClick?.(metric);
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {metric.name}
          </h3>
          {metric.changeType && (
            <div className={`flex items-center space-x-1 ${
              metric.changeType === 'increase' ? 'text-green-600 dark:text-green-400' :
              metric.changeType === 'decrease' ? 'text-red-600 dark:text-red-400' :
              'text-gray-500 dark:text-gray-400'
            }`}>
              {metric.changeType === 'increase' && (
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              )}
              {metric.changeType === 'decrease' && (
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
              {metric.change !== undefined && (
                <span className="text-xs font-medium">
                  {metric.change > 0 ? '+' : ''}{metric.change.toFixed(1)}%
                </span>
              )}
            </div>
          )}
        </div>
        
        <div className="mb-2">
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {formatMetricValue(metric.value, metric.format)}
          </div>
          
          {showComparisons && metric.previousValue !== undefined && (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              vs {formatMetricValue(metric.previousValue, metric.format)} previous period
            </div>
          )}
        </div>
        
        {metric.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {metric.description}
          </p>
        )}
      </div>
    );
  }, [selectedMetric, onMetricClick, formatMetricValue, showComparisons]);

  // Render simple chart
  const renderChart = useCallback((data: ChartDataPoint[], title: string) => {
    if (data.length === 0) return null;
    
    const maxValue = Math.max(...data.map(d => d.value));
    const minValue = Math.min(...data.map(d => d.value));
    const range = maxValue - minValue || 1;
    
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h3>
          
          <select
            value={chartType}
            onChange={(e) => setChartType(e.target.value as any)}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          >
            <option value="line">Line Chart</option>
            <option value="bar">Bar Chart</option>
            <option value="area">Area Chart</option>
          </select>
        </div>
        
        <div className="relative h-64">
          <div className="flex items-end justify-between h-full space-x-1">
            {data.map((point, index) => {
              const height = range > 0 ? ((point.value - minValue) / range) * 100 : 0;
              
              return (
                <div
                  key={point.date}
                  className="flex-1 flex flex-col items-center group"
                >
                  <div className="relative w-full flex items-end justify-center">
                    {chartType === 'bar' && (
                      <div
                        className="w-full bg-blue-500 dark:bg-blue-400 rounded-t transition-all hover:bg-blue-600 dark:hover:bg-blue-300"
                        style={{ height: `${height}%` }}
                      />
                    )}
                    
                    {chartType === 'line' && index > 0 && (
                      <svg
                        className="absolute inset-0 w-full h-full pointer-events-none"
                        preserveAspectRatio="none"
                      >
                        <line
                          x1="0"
                          y1={`${100 - ((data[index - 1].value - minValue) / range) * 100}%`}
                          x2="100%"
                          y2={`${100 - height}%`}
                          stroke="currentColor"
                          strokeWidth="2"
                          className="text-blue-500 dark:text-blue-400"
                        />
                      </svg>
                    )}
                    
                    {chartType === 'line' && (
                      <div
                        className="absolute w-2 h-2 bg-blue-500 dark:bg-blue-400 rounded-full"
                        style={{ bottom: `${height}%`, transform: 'translateY(50%)' }}
                      />
                    )}
                    
                    {chartType === 'area' && (
                      <div
                        className="w-full bg-gradient-to-t from-blue-200 to-blue-500 dark:from-blue-800 dark:to-blue-400 opacity-70"
                        style={{ height: `${height}%` }}
                      />
                    )}
                  </div>
                  
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
                    {point.label}
                  </div>
                  
                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                    {formatMetricValue(point.value, selectedMetric?.includes('amount') ? 'currency' : selectedMetric?.includes('confidence') ? 'percentage' : 'number')}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }, [chartType, formatMetricValue, selectedMetric]);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Controls */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Transaction Analytics
        </h2>
        
        <div className="flex items-center space-x-4">
          {/* Time Range Selector */}
          <select
            value={selectedTimeRange}
            onChange={(e) => setSelectedTimeRange(parseInt(e.target.value))}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          
          {/* Export Button */}
          {onExport && (
            <button
              onClick={() => onExport(analyticsMetrics, 'json')}
              className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Export Data
            </button>
          )}
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {analyticsMetrics.map(renderMetricCard)}
      </div>

      {/* Charts */}
      {showTrends && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {selectedMetric && chartData[selectedMetric] && 
            renderChart(chartData[selectedMetric], `${analyticsMetrics.find(m => m.id === selectedMetric)?.name} Trend`)
          }
          
          {!selectedMetric && (
            <>
              {renderChart(chartData['transaction-count'], 'Transaction Count Trend')}
              {renderChart(chartData['transaction-amount'], 'Transaction Amount Trend')}
            </>
          )}
        </div>
      )}

      {/* Status Breakdown */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Processing Status Breakdown
        </h3>
        
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {['PENDING', 'APPROVED', 'REJECTED', 'AUTO_APPROVED'].map(status => {
            const count = filteredSuggestions.filter(s => s.approval_status === status).length;
            const percentage = filteredSuggestions.length > 0 ? (count / filteredSuggestions.length) * 100 : 0;
            
            const statusColors: Record<string, string> = {
              PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
              APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
              REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
              AUTO_APPROVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
            };
            
            return (
              <div key={status} className="text-center">
                <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusColors[status]}`}>
                  {status.replace('_', ' ')}
                </div>
                <div className="mt-2">
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {count}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {percentage.toFixed(1)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}