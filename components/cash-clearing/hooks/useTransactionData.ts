'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CashTransaction, CashClearingSuggestion, ProcessorPattern, GLPattern } from '../../../lib/types';

export interface TransactionFilters {
  status?: 'unprocessed' | 'processed' | 'failed' | 'all';
  pattern?: string;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
  accountId?: string;
  currencyCode?: string;
  sortBy?: 'transaction_date' | 'amount' | 'created_at' | 'confidence';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  searchQuery?: string;
  confidenceMin?: number;
  confidenceMax?: number;
  batchId?: string;
}

export interface TransactionSummary {
  totalAmount: number;
  transactionCount: number;
  averageAmount: number;
  statusBreakdown: Record<string, number>;
  currencyBreakdown: Record<string, number>;
}

export interface TransactionData {
  transactions: CashTransaction[];
  suggestions: CashClearingSuggestion[];
  patterns: ProcessorPattern[];
  glMappings: GLPattern[];
  summary: TransactionSummary;
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
    totalPages: number;
    currentPage: number;
  };
  filterOptions: {
    patterns: string[];
    accounts: string[];
    currencies: string[];
    sourceSystems: string[];
    batchIds: string[];
    glAccounts: string[];
  };
}

export interface UseTransactionDataResult {
  data: TransactionData | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updateFilters: (filters: Partial<TransactionFilters>) => void;
  clearFilters: () => void;
  exportData: (format: 'csv' | 'excel' | 'pdf') => Promise<void>;
  optimisticUpdate: (transactionId: string, updates: Partial<CashTransaction>) => void;
  revertOptimisticUpdate: (transactionId: string) => void;
}

const DEFAULT_FILTERS: TransactionFilters = {
  status: 'unprocessed',
  sortBy: 'transaction_date',
  sortOrder: 'desc',
  limit: 50,
  offset: 0
};

export function useTransactionData(
  initialFilters: Partial<TransactionFilters> = {},
  enableRealTimeUpdates = false,
  pollInterval = 30000
): UseTransactionDataResult {
  const [data, setData] = useState<TransactionData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<TransactionFilters>({
    ...DEFAULT_FILTERS,
    ...initialFilters
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const optimisticUpdatesRef = useRef<Map<string, Partial<CashTransaction>>>(new Map());

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    try {
      setError(null);
      
      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Use provided signal or create new one
      const finalSignal = signal || abortController.signal;

      // Build query parameters
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });

      // Fetch transactions and related data in parallel
      const [transactionsResponse, approvalsResponse] = await Promise.all([
        fetch(`/api/cash-clearing/transactions?${params}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': process.env.NEXT_PUBLIC_CASH_CLEARING_API_KEY || '',
          },
          signal: finalSignal
        }),
        fetch(`/api/cash-clearing/approvals?includeDetails=true&${params}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': process.env.NEXT_PUBLIC_CASH_CLEARING_API_KEY || '',
          },
          signal: finalSignal
        })
      ]);

      if (!transactionsResponse.ok) {
        throw new Error(`Failed to fetch transactions: ${transactionsResponse.status}`);
      }

      if (!approvalsResponse.ok) {
        throw new Error(`Failed to fetch approvals: ${approvalsResponse.status}`);
      }

      const [transactionsData, approvalsData] = await Promise.all([
        transactionsResponse.json(),
        approvalsResponse.json()
      ]);

      // Apply optimistic updates
      const transactionsWithUpdates = transactionsData.data.map((transaction: CashTransaction) => {
        const optimisticUpdate = optimisticUpdatesRef.current.get(transaction.transaction_id);
        return optimisticUpdate ? { ...transaction, ...optimisticUpdate } : transaction;
      });

      setData({
        transactions: transactionsWithUpdates,
        suggestions: approvalsData.data || [],
        patterns: [], // TODO: Fetch from patterns endpoint
        glMappings: [], // TODO: Fetch from GL mappings endpoint
        summary: transactionsData.summary,
        pagination: transactionsData.pagination,
        filterOptions: {
          ...transactionsData.filters.available,
          ...approvalsData.filters?.available
        }
      });

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was aborted, don't set error
        return;
      }

      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('Error fetching transaction data:', err);
    }
  }, [filters]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      await fetchData();
    } finally {
      setIsLoading(false);
    }
  }, [fetchData]);

  const updateFilters = useCallback((newFilters: Partial<TransactionFilters>) => {
    setFilters(prev => ({
      ...prev,
      ...newFilters,
      // Reset offset when filters change (except for pagination)
      offset: newFilters.offset !== undefined ? newFilters.offset : 0
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    optimisticUpdatesRef.current.clear();
  }, []);

  const exportData = useCallback(async (format: 'csv' | 'excel' | 'pdf') => {
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });
      params.append('export', 'true');
      params.append('format', format);

      const response = await fetch(`/api/cash-clearing/transactions/export?${params}`, {
        method: 'GET',
        headers: {
          'X-API-Key': process.env.NEXT_PUBLIC_CASH_CLEARING_API_KEY || '',
        }
      });

      if (!response.ok) {
        throw new Error(`Export failed: ${response.status}`);
      }

      // Download the file
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transactions-export.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Export failed';
      setError(errorMessage);
      console.error('Error exporting data:', err);
    }
  }, [filters]);

  const optimisticUpdate = useCallback((transactionId: string, updates: Partial<CashTransaction>) => {
    optimisticUpdatesRef.current.set(transactionId, updates);
    
    // Update the current data optimistically
    setData(prevData => {
      if (!prevData) return prevData;
      
      return {
        ...prevData,
        transactions: prevData.transactions.map(transaction =>
          transaction.transaction_id === transactionId
            ? { ...transaction, ...updates }
            : transaction
        )
      };
    });
  }, []);

  const revertOptimisticUpdate = useCallback((transactionId: string) => {
    optimisticUpdatesRef.current.delete(transactionId);
    // Trigger a refresh to get the real data
    refresh();
  }, [refresh]);

  // Initial data fetch
  useEffect(() => {
    refresh();
  }, [filters]);

  // Real-time updates with polling
  useEffect(() => {
    if (!enableRealTimeUpdates) return;

    const setupPolling = () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }

      pollIntervalRef.current = setInterval(() => {
        if (!document.hidden) {
          // Only poll when tab is visible
          const abortController = new AbortController();
          fetchData(abortController.signal);
        }
      }, pollInterval);
    };

    setupPolling();

    // Handle visibility change
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      } else {
        setupPolling();
        // Refresh immediately when tab becomes visible
        refresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enableRealTimeUpdates, pollInterval, fetchData, refresh]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  return {
    data,
    isLoading,
    error,
    refresh,
    updateFilters,
    clearFilters,
    exportData,
    optimisticUpdate,
    revertOptimisticUpdate
  };
}