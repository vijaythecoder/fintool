'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { ConfidenceBadge } from './ConfidenceIndicator';
import { useVirtualScrolling } from './hooks/useVirtualScrolling';
import { useKeyboardNavigation, useSelection } from './hooks/useKeyboardNavigation';
import type { CashTransaction, CashClearingSuggestion, ProcessorPattern, GLPattern } from '../../lib/types';

export interface TransactionTableColumn {
  key: string;
  label: string;
  width?: number | string;
  sortable?: boolean;
  resizable?: boolean;
  hidden?: boolean;
  align?: 'left' | 'center' | 'right';
  render?: (value: any, transaction: EnrichedTransaction) => React.ReactNode;
  accessor?: (transaction: EnrichedTransaction) => any;
}

export interface EnrichedTransaction extends CashTransaction {
  suggestion?: CashClearingSuggestion;
  patternDetails?: ProcessorPattern;
  glMapping?: GLPattern;
  riskScore?: number;
  businessImpact?: {
    category: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    amount_impact: number;
    account_impact: string;
  };
}

export interface TransactionTableProps {
  transactions: CashTransaction[];
  suggestions?: CashClearingSuggestion[];
  patterns?: ProcessorPattern[];
  glMappings?: GLPattern[];
  columns?: TransactionTableColumn[];
  height?: number;
  enableVirtualScrolling?: boolean;
  enableKeyboardNavigation?: boolean;
  enableColumnResize?: boolean;
  enableColumnReorder?: boolean;
  enableRowSelection?: boolean;
  multiSelect?: boolean;
  selectedTransactionIds?: string[];
  onSelectionChange?: (selectedIds: string[]) => void;
  onTransactionClick?: (transaction: EnrichedTransaction) => void;
  onApprove?: (suggestionId: string, reason?: string) => Promise<void>;
  onReject?: (suggestionId: string, reason: string) => Promise<void>;
  onSort?: (column: string, direction: 'asc' | 'desc') => void;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  isLoading?: boolean;
  emptyMessage?: string;
  className?: string;
  itemHeight?: number;
  overscan?: number;
}

const DEFAULT_COLUMNS: TransactionTableColumn[] = [
  {
    key: 'selection',
    label: '',
    width: 50,
    sortable: false,
    resizable: false
  },
  {
    key: 'transaction_id',
    label: 'Transaction ID',
    width: 150,
    sortable: true,
    accessor: (t) => t.transaction_id,
    render: (value) => (
      <div className="font-mono text-sm truncate" title={value}>
        {value.substring(0, 8)}...
      </div>
    )
  },
  {
    key: 'description',
    label: 'Description',
    width: 250,
    sortable: true,
    accessor: (t) => t.description,
    render: (value) => (
      <div className="truncate" title={value}>
        {value}
      </div>
    )
  },
  {
    key: 'amount',
    label: 'Amount',
    width: 120,
    align: 'right',
    sortable: true,
    accessor: (t) => t.amount,
    render: (value, transaction) => (
      <div className="font-semibold">
        {new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: transaction.currency_code || 'USD'
        }).format(value)}
      </div>
    )
  },
  {
    key: 'transaction_date',
    label: 'Date',
    width: 120,
    sortable: true,
    accessor: (t) => t.transaction_date,
    render: (value) => format(new Date(value), 'MMM dd, yyyy')
  },
  {
    key: 'pattern',
    label: 'Pattern',
    width: 120,
    sortable: true,
    accessor: (t) => t.pattern
  },
  {
    key: 'gl_account',
    label: 'GL Account',
    width: 150,
    sortable: true,
    accessor: (t) => t.suggestion?.gl_account_code,
    render: (value, transaction) => {
      if (!value) return <span className="text-gray-400">-</span>;
      return (
        <div>
          <div className="font-mono text-sm">{value}</div>
          <div className="text-xs text-gray-500">
            {transaction.suggestion?.debit_credit_indicator}
          </div>
        </div>
      );
    }
  },
  {
    key: 'confidence',
    label: 'Confidence',
    width: 120,
    sortable: true,
    accessor: (t) => t.suggestion?.confidence_score,
    render: (value) => {
      if (value === undefined) return <span className="text-gray-400">-</span>;
      return <ConfidenceBadge confidence={value} size="sm" />;
    }
  },
  {
    key: 'status',
    label: 'Status',
    width: 120,
    sortable: true,
    accessor: (t) => t.suggestion?.approval_status,
    render: (value) => {
      if (!value) return <span className="text-gray-400">-</span>;
      
      const statusColors: Record<string, string> = {
        PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
        APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
        REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
        AUTO_APPROVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
      };

      return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[value as string] || 'bg-gray-100 text-gray-800'}`}>
          {(value as string).replace('_', ' ')}
        </span>
      );
    }
  },
  {
    key: 'risk_score',
    label: 'Risk',
    width: 80,
    sortable: true,
    accessor: (t) => t.riskScore,
    render: (value) => {
      if (value === undefined) return <span className="text-gray-400">-</span>;
      
      const riskLevel = value >= 0.7 ? 'high' : value >= 0.4 ? 'medium' : 'low';
      const colors = {
        high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
        medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
        low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
      };

      return (
        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${colors[riskLevel]}`}>
          {(value * 100).toFixed(0)}%
        </span>
      );
    }
  },
  {
    key: 'actions',
    label: 'Actions',
    width: 120,
    sortable: false,
    resizable: false
  }
];

export function TransactionTable({
  transactions,
  suggestions = [],
  patterns = [],
  glMappings = [],
  columns = DEFAULT_COLUMNS,
  height = 600,
  enableVirtualScrolling = true,
  enableKeyboardNavigation = true,
  enableColumnResize = true,
  enableColumnReorder = false,
  enableRowSelection = true,
  multiSelect = true,
  selectedTransactionIds = [],
  onSelectionChange,
  onTransactionClick,
  onApprove,
  onReject,
  onSort,
  sortBy,
  sortOrder = 'desc',
  isLoading = false,
  emptyMessage = 'No transactions found',
  className = '',
  itemHeight = 60,
  overscan = 5
}: TransactionTableProps) {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [columnOrder, setColumnOrder] = useState<string[]>(columns.map(c => c.key));
  const tableRef = useRef<HTMLDivElement>(null);
  const resizeStartRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // Enrich transactions with suggestions and additional data
  const enrichedTransactions = useMemo((): EnrichedTransaction[] => {
    return transactions.map(transaction => {
      const suggestion = suggestions.find(s => s.transaction_id === transaction.transaction_id);
      const patternDetails = patterns.find(p => p.pattern_id === suggestion?.pattern_matched);
      const glMapping = glMappings.find(gl => gl.gl_account_code === suggestion?.gl_account_code);
      
      // Calculate risk score
      let riskScore = 0;
      if (suggestion) {
        if (suggestion.confidence_score < 0.5) riskScore += 0.4;
        else if (suggestion.confidence_score < 0.7) riskScore += 0.2;
        
        if (transaction.amount > 50000) riskScore += 0.3;
        else if (transaction.amount > 10000) riskScore += 0.1;
        
        if (!suggestion.gl_account_code) riskScore += 0.3;
      }

      // Calculate business impact
      let priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
      if (transaction.amount > 100000) priority = 'CRITICAL';
      else if (transaction.amount > 50000) priority = 'HIGH';
      else if (transaction.amount > 10000) priority = 'MEDIUM';

      const businessImpact = {
        category: suggestion?.gl_account_code ? 'STANDARD' : 'UNMAPPED',
        priority,
        amount_impact: transaction.amount,
        account_impact: suggestion?.gl_account_code || 'UNKNOWN'
      };

      return {
        ...transaction,
        suggestion,
        patternDetails,
        glMapping,
        riskScore: Math.min(riskScore, 1.0),
        businessImpact
      };
    });
  }, [transactions, suggestions, patterns, glMappings]);

  // Selection management
  const [selectionState, selectionActions] = useSelection(
    enrichedTransactions,
    (transaction) => transaction.transaction_id,
    multiSelect
  );

  // Virtual scrolling
  const virtualScrolling = useVirtualScrolling(enrichedTransactions, {
    itemHeight,
    containerHeight: height - 120, // Account for header
    overscan
  });

  // Get visible columns in order
  const visibleColumns = useMemo(() => {
    const orderedColumns = columnOrder
      .map(key => columns.find(col => col.key === key))
      .filter((col): col is TransactionTableColumn => !!col && !col.hidden);

    // Filter out selection column if row selection is disabled
    return enableRowSelection ? orderedColumns : orderedColumns.filter(col => col.key !== 'selection');
  }, [columns, columnOrder, enableRowSelection]);

  // Handle column resize
  const handleColumnResize = useCallback((columnKey: string, width: number) => {
    setColumnWidths(prev => ({
      ...prev,
      [columnKey]: Math.max(50, width)
    }));
  }, []);

  const startColumnResize = useCallback((e: React.MouseEvent, columnKey: string) => {
    if (!enableColumnResize) return;

    e.preventDefault();
    setResizingColumn(columnKey);
    
    const startX = e.clientX;
    const currentWidth = columnWidths[columnKey] || 
      visibleColumns.find(col => col.key === columnKey)?.width as number || 100;
    
    resizeStartRef.current = { startX, startWidth: currentWidth };

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeStartRef.current) return;
      
      const deltaX = e.clientX - resizeStartRef.current.startX;
      const newWidth = resizeStartRef.current.startWidth + deltaX;
      handleColumnResize(columnKey, newWidth);
    };

    const handleMouseUp = () => {
      setResizingColumn(null);
      resizeStartRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [enableColumnResize, columnWidths, visibleColumns, handleColumnResize]);

  // Handle selection changes
  useEffect(() => {
    const selectedIds = Array.from(selectionState.selectedItems);
    if (onSelectionChange && JSON.stringify(selectedIds) !== JSON.stringify(selectedTransactionIds)) {
      onSelectionChange(selectedIds);
    }
  }, [selectionState.selectedItems, onSelectionChange, selectedTransactionIds]);

  // Keyboard navigation
  const keyboardNavigation = useKeyboardNavigation({
    enabled: enableKeyboardNavigation,
    onArrowUp: () => {
      selectionActions.moveFocus('up', enrichedTransactions.length);
    },
    onArrowDown: () => {
      selectionActions.moveFocus('down', enrichedTransactions.length);
    },
    onEnter: () => {
      const focusedTransaction = enrichedTransactions[selectionState.focusedIndex];
      if (focusedTransaction && onTransactionClick) {
        onTransactionClick(focusedTransaction);
      }
    },
    onSpace: () => {
      const focusedTransaction = enrichedTransactions[selectionState.focusedIndex];
      if (focusedTransaction) {
        selectionActions.toggleSelection(focusedTransaction);
      }
    },
    onSelectAll: () => {
      selectionActions.selectAll(enrichedTransactions);
    },
    onEscape: () => {
      selectionActions.clearSelection();
    },
    onHome: () => {
      selectionActions.moveFocus('home', enrichedTransactions.length);
      virtualScrolling.scrollToTop();
    },
    onEnd: () => {
      selectionActions.moveFocus('end', enrichedTransactions.length);
      virtualScrolling.scrollToBottom();
    }
  });

  // Attach keyboard navigation to table element
  useEffect(() => {
    if (tableRef.current) {
      keyboardNavigation.attachToElement(tableRef.current);
    }
  }, [keyboardNavigation]);

  // Handle sort
  const handleSort = useCallback((columnKey: string) => {
    const column = visibleColumns.find(col => col.key === columnKey);
    if (!column?.sortable || !onSort) return;

    const newOrder = sortBy === columnKey && sortOrder === 'asc' ? 'desc' : 'asc';
    onSort(columnKey, newOrder);
  }, [visibleColumns, sortBy, sortOrder, onSort]);

  // Render column header
  const renderColumnHeader = useCallback((column: TransactionTableColumn) => {
    const width = columnWidths[column.key] || column.width || 100;
    const isResizing = resizingColumn === column.key;
    const isSorted = sortBy === column.key;

    return (
      <th
        key={column.key}
        className={`px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-r border-gray-200 dark:border-gray-700 relative select-none ${
          column.sortable ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700' : ''
        } ${isResizing ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
        style={{ 
          width: typeof width === 'number' ? `${width}px` : width,
          minWidth: typeof width === 'number' ? `${width}px` : width
        }}
        onClick={() => handleSort(column.key)}
      >
        <div className="flex items-center space-x-1">
          <span className={column.align === 'center' ? 'mx-auto' : column.align === 'right' ? 'ml-auto' : ''}>
            {column.label}
          </span>
          {column.sortable && (
            <div className="flex flex-col">
              <svg 
                className={`w-3 h-3 ${isSorted && sortOrder === 'asc' ? 'text-blue-600' : 'text-gray-400'}`}
                viewBox="0 0 20 20" 
                fill="currentColor"
              >
                <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
              <svg 
                className={`w-3 h-3 ${isSorted && sortOrder === 'desc' ? 'text-blue-600' : 'text-gray-400'}`}
                viewBox="0 0 20 20" 
                fill="currentColor"
              >
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </div>
          )}
        </div>

        {/* Resize handle */}
        {enableColumnResize && column.resizable !== false && (
          <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 opacity-0 hover:opacity-100 transition-opacity"
            onMouseDown={(e) => startColumnResize(e, column.key)}
          />
        )}
      </th>
    );
  }, [columnWidths, resizingColumn, sortBy, sortOrder, enableColumnResize, handleSort, startColumnResize]);

  // Render table cell
  const renderCell = useCallback((column: TransactionTableColumn, transaction: EnrichedTransaction, rowIndex: number) => {
    const width = columnWidths[column.key] || column.width || 100;
    const isSelected = selectionState.selectedItems.has(transaction.transaction_id);
    const isFocused = selectionState.focusedIndex === rowIndex;

    if (column.key === 'selection') {
      return (
        <td 
          key={column.key}
          className="px-4 py-3 border-r border-gray-200 dark:border-gray-700"
          style={{ width: typeof width === 'number' ? `${width}px` : width }}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => selectionActions.toggleSelection(transaction)}
            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
          />
        </td>
      );
    }

    if (column.key === 'actions') {
      return (
        <td 
          key={column.key}
          className="px-4 py-3 border-r border-gray-200 dark:border-gray-700"
          style={{ width: typeof width === 'number' ? `${width}px` : width }}
          onClick={(e) => e.stopPropagation()}
        >
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
      );
    }

    const value = column.accessor ? column.accessor(transaction) : transaction[column.key as keyof EnrichedTransaction];
    const content = column.render ? column.render(value, transaction) : value;

    return (
      <td
        key={column.key}
        className={`px-4 py-3 border-r border-gray-200 dark:border-gray-700 ${
          column.align === 'center' ? 'text-center' : column.align === 'right' ? 'text-right' : 'text-left'
        }`}
        style={{ width: typeof width === 'number' ? `${width}px` : width }}
      >
        {content}
      </td>
    );
  }, [columnWidths, selectionState, selectionActions, isLoading, onApprove, onReject]);

  // Loading state
  if (isLoading) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}>
        <div className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading transactions...</p>
        </div>
      </div>
    );
  }

  // Empty state
  if (enrichedTransactions.length === 0) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}>
        <div className="p-8 text-center">
          <div className="w-12 h-12 mx-auto mb-4 text-gray-400 dark:text-gray-500">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No transactions</h3>
          <p className="text-gray-600 dark:text-gray-400">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={tableRef}
      className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm ${className}`}
      tabIndex={0}
    >
      {/* Table Header */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              {visibleColumns.map(renderColumnHeader)}
            </tr>
          </thead>
        </table>
      </div>

      {/* Table Body */}
      {enableVirtualScrolling ? (
        <div {...virtualScrolling.scrollElementProps}>
          <div {...virtualScrolling.wrapperProps}>
            {virtualScrolling.virtualItems.map(({ index, start, item: transaction }) => {
              const isSelected = selectionState.selectedItems.has(transaction.transaction_id);
              const isFocused = selectionState.focusedIndex === index;

              return (
                <div
                  key={transaction.transaction_id}
                  className={`absolute w-full ${
                    index % 2 === 0
                      ? 'bg-white dark:bg-gray-900'
                      : 'bg-gray-50 dark:bg-gray-800'
                  } border-b dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${
                    isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  } ${
                    isFocused ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''
                  }`}
                  style={{
                    top: start,
                    height: itemHeight
                  }}
                  onClick={() => {
                    selectionActions.setFocusedIndex(index);
                    onTransactionClick?.(transaction);
                  }}
                >
                  <table className="w-full h-full">
                    <tbody>
                      <tr>
                        {visibleColumns.map(column => renderCell(column, transaction, index))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto" style={{ maxHeight: height - 120 }}>
          <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
            <tbody>
              {enrichedTransactions.map((transaction, index) => {
                const isSelected = selectionState.selectedItems.has(transaction.transaction_id);
                const isFocused = selectionState.focusedIndex === index;

                return (
                  <tr
                    key={transaction.transaction_id}
                    className={`${
                      index % 2 === 0
                        ? 'bg-white dark:bg-gray-900'
                        : 'bg-gray-50 dark:bg-gray-800'
                    } border-b dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${
                      isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    } ${
                      isFocused ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''
                    }`}
                    onClick={() => {
                      selectionActions.setFocusedIndex(index);
                      onTransactionClick?.(transaction);
                    }}
                  >
                    {visibleColumns.map(column => renderCell(column, transaction, index))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}