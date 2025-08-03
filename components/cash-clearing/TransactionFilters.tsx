'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import type { TransactionFilters } from './hooks/useTransactionData';

export interface FilterPreset {
  id: string;
  name: string;
  description?: string;
  filters: Partial<TransactionFilters>;
  isDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface FilterOptions {
  patterns: string[];
  accounts: string[];
  currencies: string[];
  sourceSystems: string[];
  batchIds: string[];
  glAccounts: string[];
  approvers: string[];
}

export interface TransactionFiltersProps {
  filters: TransactionFilters;
  filterOptions: FilterOptions;
  presets?: FilterPreset[];
  onFiltersChange: (filters: Partial<TransactionFilters>) => void;
  onPresetSave?: (preset: Omit<FilterPreset, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onPresetLoad?: (preset: FilterPreset) => void;
  onPresetDelete?: (presetId: string) => void;
  onReset: () => void;
  isLoading?: boolean;
  className?: string;
  showAdvanced?: boolean;
}

const DEFAULT_PRESETS: FilterPreset[] = [
  {
    id: 'pending-approval',
    name: 'Pending Approval',
    description: 'Transactions requiring human approval',
    filters: {
      status: 'unprocessed',
      confidenceMax: 0.85
    },
    isDefault: true
  },
  {
    id: 'high-risk',
    name: 'High Risk',
    description: 'High value or low confidence transactions',
    filters: {
      amountMin: 10000,
      confidenceMax: 0.6
    },
    isDefault: true
  },
  {
    id: 'recent-processed',
    name: 'Recently Processed',
    description: 'Transactions processed in the last 7 days',
    filters: {
      status: 'processed',
      dateFrom: format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
    },
    isDefault: true
  },
  {
    id: 'failed-transactions',
    name: 'Failed Transactions',
    description: 'Transactions that failed processing',
    filters: {
      status: 'failed'
    },
    isDefault: true
  }
];

export function TransactionFilters({
  filters,
  filterOptions,
  presets = DEFAULT_PRESETS,
  onFiltersChange,
  onPresetSave,
  onPresetLoad,
  onPresetDelete,
  onReset,
  isLoading = false,
  className = '',
  showAdvanced: initialShowAdvanced = false
}: TransactionFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(initialShowAdvanced);
  const [showPresets, setShowPresets] = useState(false);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetDescription, setPresetDescription] = useState('');

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    Object.entries(filters).forEach(([key, value]) => {
      if (key === 'limit' || key === 'offset') return; // Skip pagination
      if (value !== undefined && value !== null && value !== '' && value !== 'all') {
        count++;
      }
    });
    return count;
  }, [filters]);

  // Handle filter changes
  const handleFilterChange = useCallback((key: keyof TransactionFilters, value: any) => {
    onFiltersChange({ [key]: value });
  }, [onFiltersChange]);

  // Handle date range shortcuts
  const handleDateShortcut = useCallback((days: number) => {
    const toDate = format(new Date(), 'yyyy-MM-dd');
    const fromDate = format(new Date(Date.now() - days * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
    onFiltersChange({
      dateFrom: fromDate,
      dateTo: toDate
    });
  }, [onFiltersChange]);

  // Handle amount range shortcuts
  const handleAmountShortcut = useCallback((range: { min?: number; max?: number }) => {
    onFiltersChange({
      amountMin: range.min,
      amountMax: range.max
    });
  }, [onFiltersChange]);

  // Handle confidence shortcuts
  const handleConfidenceShortcut = useCallback((range: { min?: number; max?: number }) => {
    onFiltersChange({
      confidenceMin: range.min,
      confidenceMax: range.max
    });
  }, [onFiltersChange]);

  // Save preset
  const handleSavePreset = useCallback(() => {
    if (!presetName.trim() || !onPresetSave) return;

    onPresetSave({
      name: presetName.trim(),
      description: presetDescription.trim() || undefined,
      filters
    });

    setPresetName('');
    setPresetDescription('');
    setShowSavePreset(false);
  }, [presetName, presetDescription, filters, onPresetSave]);

  // Load preset
  const handleLoadPreset = useCallback((preset: FilterPreset) => {
    if (onPresetLoad) {
      onPresetLoad(preset);
    } else {
      onFiltersChange(preset.filters);
    }
    setShowPresets(false);
  }, [onFiltersChange, onPresetLoad]);

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Filters
            </h3>
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                {activeFilterCount} active
              </span>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            {onPresetSave && (
              <button
                onClick={() => setShowSavePreset(true)}
                disabled={isLoading || activeFilterCount === 0}
                className="px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 rounded-md hover:bg-blue-200 dark:hover:bg-blue-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Save Preset
              </button>
            )}
            
            <button
              onClick={() => setShowPresets(!showPresets)}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Presets
            </button>
            
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              {showAdvanced ? 'Simple' : 'Advanced'}
            </button>
            
            <button
              onClick={onReset}
              disabled={isLoading || activeFilterCount === 0}
              className="px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 rounded-md hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Presets Panel */}
      {showPresets && (
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Filter Presets</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {presets.map((preset) => (
                <div key={preset.id} className="group relative">
                  <button
                    onClick={() => handleLoadPreset(preset)}
                    className="w-full text-left p-3 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {preset.name}
                    </div>
                    {preset.description && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {preset.description}
                      </div>
                    )}
                  </button>
                  
                  {!preset.isDefault && onPresetDelete && (
                    <button
                      onClick={() => onPresetDelete(preset.id)}
                      className="absolute top-1 right-1 w-5 h-5 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Save Preset Modal */}
      {showSavePreset && (
        <div className="px-6 py-4 bg-blue-50 dark:bg-blue-900/20 border-b border-gray-200 dark:border-gray-700">
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Save Current Filters as Preset</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Preset name"
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <input
                type="text"
                value={presetDescription}
                onChange={(e) => setPresetDescription(e.target.value)}
                placeholder="Description (optional)"
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex space-x-2">
              <button
                onClick={handleSavePreset}
                disabled={!presetName.trim()}
                className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setShowSavePreset(false);
                  setPresetName('');
                  setPresetDescription('');
                }}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter Controls */}
      <div className="px-6 py-4 space-y-4">
        {/* Basic Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Status
            </label>
            <select
              value={filters.status || 'all'}
              onChange={(e) => handleFilterChange('status', e.target.value === 'all' ? undefined : e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Status</option>
              <option value="unprocessed">Unprocessed</option>
              <option value="processed">Processed</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          {/* Pattern */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Pattern
            </label>
            <select
              value={filters.pattern || ''}
              onChange={(e) => handleFilterChange('pattern', e.target.value || undefined)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Patterns</option>
              {filterOptions.patterns.map((pattern) => (
                <option key={pattern} value={pattern}>
                  {pattern}
                </option>
              ))}
            </select>
          </div>

          {/* Currency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Currency
            </label>
            <select
              value={filters.currencyCode || ''}
              onChange={(e) => handleFilterChange('currencyCode', e.target.value || undefined)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Currencies</option>
              {filterOptions.currencies.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Sort By
            </label>
            <select
              value={`${filters.sortBy || 'transaction_date'}-${filters.sortOrder || 'desc'}`}
              onChange={(e) => {
                const [sortBy, sortOrder] = e.target.value.split('-');
                handleFilterChange('sortBy', sortBy);
                handleFilterChange('sortOrder', sortOrder);
              }}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="transaction_date-desc">Date (Newest)</option>
              <option value="transaction_date-asc">Date (Oldest)</option>
              <option value="amount-desc">Amount (Highest)</option>
              <option value="amount-asc">Amount (Lowest)</option>
              <option value="confidence-desc">Confidence (Highest)</option>
              <option value="confidence-asc">Confidence (Lowest)</option>
              <option value="created_at-desc">Created (Newest)</option>
              <option value="created_at-asc">Created (Oldest)</option>
            </select>
          </div>
        </div>

        {/* Date Range */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Date Range
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={filters.dateFrom || ''}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value || undefined)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <span className="text-gray-500 dark:text-gray-400">to</span>
            <input
              type="date"
              value={filters.dateTo || ''}
              onChange={(e) => handleFilterChange('dateTo', e.target.value || undefined)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            
            {/* Date shortcuts */}
            <div className="flex flex-wrap gap-1 ml-4">
              <button
                onClick={() => handleDateShortcut(1)}
                className="px-2 py-1 text-xs text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50"
              >
                Today
              </button>
              <button
                onClick={() => handleDateShortcut(7)}
                className="px-2 py-1 text-xs text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50"
              >
                7 days
              </button>
              <button
                onClick={() => handleDateShortcut(30)}
                className="px-2 py-1 text-xs text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50"
              >
                30 days
              </button>
            </div>
          </div>
        </div>

        {/* Advanced Filters */}
        {showAdvanced && (
          <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            {/* Amount Range */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Amount Range
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  value={filters.amountMin || ''}
                  onChange={(e) => handleFilterChange('amountMin', e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="Min amount"
                  className="w-32 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="text-gray-500 dark:text-gray-400">to</span>
                <input
                  type="number"
                  value={filters.amountMax || ''}
                  onChange={(e) => handleFilterChange('amountMax', e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="Max amount"
                  className="w-32 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                
                {/* Amount shortcuts */}
                <div className="flex flex-wrap gap-1 ml-4">
                  <button
                    onClick={() => handleAmountShortcut({ max: 1000 })}
                    className="px-2 py-1 text-xs text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30 rounded hover:bg-green-200 dark:hover:bg-green-900/50"
                  >
                    &lt; $1K
                  </button>
                  <button
                    onClick={() => handleAmountShortcut({ min: 1000, max: 10000 })}
                    className="px-2 py-1 text-xs text-yellow-700 dark:text-yellow-300 bg-yellow-100 dark:bg-yellow-900/30 rounded hover:bg-yellow-200 dark:hover:bg-yellow-900/50"
                  >
                    $1K-$10K
                  </button>
                  <button
                    onClick={() => handleAmountShortcut({ min: 10000 })}
                    className="px-2 py-1 text-xs text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 rounded hover:bg-red-200 dark:hover:bg-red-900/50"
                  >
                    &gt; $10K
                  </button>
                </div>
              </div>
            </div>

            {/* Confidence Range */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Confidence Range
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={filters.confidenceMin || ''}
                  onChange={(e) => handleFilterChange('confidenceMin', e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="Min confidence"
                  className="w-32 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="text-gray-500 dark:text-gray-400">to</span>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={filters.confidenceMax || ''}
                  onChange={(e) => handleFilterChange('confidenceMax', e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="Max confidence"
                  className="w-32 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                
                {/* Confidence shortcuts */}
                <div className="flex flex-wrap gap-1 ml-4">
                  <button
                    onClick={() => handleConfidenceShortcut({ min: 0.85 })}
                    className="px-2 py-1 text-xs text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30 rounded hover:bg-green-200 dark:hover:bg-green-900/50"
                  >
                    High (85%+)
                  </button>
                  <button
                    onClick={() => handleConfidenceShortcut({ min: 0.6, max: 0.85 })}
                    className="px-2 py-1 text-xs text-yellow-700 dark:text-yellow-300 bg-yellow-100 dark:bg-yellow-900/30 rounded hover:bg-yellow-200 dark:hover:bg-yellow-900/50"
                  >
                    Medium (60-84%)
                  </button>
                  <button
                    onClick={() => handleConfidenceShortcut({ max: 0.6 })}
                    className="px-2 py-1 text-xs text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 rounded hover:bg-red-200 dark:hover:bg-red-900/50"
                  >
                    Low (&lt;60%)
                  </button>
                </div>
              </div>
            </div>

            {/* Additional Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Account ID */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Account ID
                </label>
                <select
                  value={filters.accountId || ''}
                  onChange={(e) => handleFilterChange('accountId', e.target.value || undefined)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Accounts</option>
                  {filterOptions.accounts.map((account) => (
                    <option key={account} value={account}>
                      {account}
                    </option>
                  ))}
                </select>
              </div>

              {/* Batch ID */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Batch ID
                </label>
                <select
                  value={filters.batchId || ''}
                  onChange={(e) => handleFilterChange('batchId', e.target.value || undefined)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Batches</option>
                  {filterOptions.batchIds.map((batchId) => (
                    <option key={batchId} value={batchId}>
                      {batchId}
                    </option>
                  ))}
                </select>
              </div>

              {/* Items per page */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Items per page
                </label>
                <select
                  value={filters.limit || 50}
                  onChange={(e) => handleFilterChange('limit', parseInt(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}