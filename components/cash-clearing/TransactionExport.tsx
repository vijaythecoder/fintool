'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import type { CashTransaction, CashClearingSuggestion } from '../../lib/types';
import type { TransactionFilters } from './hooks/useTransactionData';

export interface ExportFormat {
  id: string;
  name: string;
  description: string;
  extension: string;
  mimeType: string;
  supportsCustomColumns: boolean;
  maxRows?: number;
  icon: React.ReactNode;
}

export interface ExportColumn {
  id: string;
  label: string;
  key: string;
  selected: boolean;
  format?: 'text' | 'number' | 'currency' | 'date' | 'percentage' | 'boolean';
  accessor?: (transaction: CashTransaction, suggestion?: CashClearingSuggestion) => any;
}

export interface ExportTemplate {
  id: string;
  name: string;
  description?: string;
  format: string;
  columns: string[];
  filters?: Partial<TransactionFilters>;
  createdAt?: string;
}

export interface TransactionExportProps {
  transactions: CashTransaction[];
  suggestions?: CashClearingSuggestion[];
  selectedTransactionIds?: string[];
  filters?: Partial<TransactionFilters>;
  onExport?: (data: any[], format: string, filename: string) => Promise<void>;
  className?: string;
  enableTemplates?: boolean;
  templates?: ExportTemplate[];
  onSaveTemplate?: (template: Omit<ExportTemplate, 'id' | 'createdAt'>) => void;
  onLoadTemplate?: (template: ExportTemplate) => void;
  onDeleteTemplate?: (templateId: string) => void;
  maxExportSize?: number;
}

const EXPORT_FORMATS: ExportFormat[] = [
  {
    id: 'csv',
    name: 'CSV',
    description: 'Comma-separated values for spreadsheet applications',
    extension: 'csv',
    mimeType: 'text/csv',
    supportsCustomColumns: true,
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm0 2h12v10H4V5z"/>
        <path d="M6 7h8v2H6V7zm0 4h8v2H6v-2z"/>
      </svg>
    )
  },
  {
    id: 'excel',
    name: 'Excel',
    description: 'Microsoft Excel format with formatting and formulas',
    extension: 'xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    supportsCustomColumns: true,
    maxRows: 1048576,
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm0 2h12v10H4V5z"/>
        <path d="M7 7l2 3-2 3h2l1-1.5L11 13h2l-2-3 2-3h-2L10 8.5 9 7H7z"/>
      </svg>
    )
  },
  {
    id: 'json',
    name: 'JSON',
    description: 'JavaScript Object Notation for programmatic access',
    extension: 'json',
    mimeType: 'application/json',
    supportsCustomColumns: true,
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
      </svg>
    )
  },
  {
    id: 'pdf',
    name: 'PDF',
    description: 'Portable Document Format for reports and sharing',
    extension: 'pdf',
    mimeType: 'application/pdf',
    supportsCustomColumns: false,
    maxRows: 10000,
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
      </svg>
    )
  }
];

const DEFAULT_COLUMNS: ExportColumn[] = [
  {
    id: 'transaction_id',
    label: 'Transaction ID',
    key: 'transaction_id',
    selected: true,
    format: 'text'
  },
  {
    id: 'description',
    label: 'Description',
    key: 'description',
    selected: true,
    format: 'text'
  },
  {
    id: 'amount',
    label: 'Amount',
    key: 'amount',
    selected: true,
    format: 'currency'
  },
  {
    id: 'transaction_date',
    label: 'Transaction Date',
    key: 'transaction_date',
    selected: true,
    format: 'date'
  },
  {
    id: 'account_id',
    label: 'Account ID',
    key: 'account_id',
    selected: true,
    format: 'text'
  },
  {
    id: 'currency_code',
    label: 'Currency',
    key: 'currency_code',
    selected: true,
    format: 'text'
  },
  {
    id: 'pattern',
    label: 'Pattern',
    key: 'pattern',
    selected: true,
    format: 'text'
  },
  {
    id: 'source_system',
    label: 'Source System',
    key: 'source_system',
    selected: false,
    format: 'text'
  },
  {
    id: 'batch_id',
    label: 'Batch ID',
    key: 'batch_id',
    selected: false,
    format: 'text'
  },
  {
    id: 'reference_number',
    label: 'Reference Number',
    key: 'reference_number',
    selected: false,
    format: 'text'
  },
  {
    id: 'gl_account_code',
    label: 'GL Account Code',
    key: 'gl_account_code',
    selected: true,
    format: 'text',
    accessor: (transaction, suggestion) => suggestion?.gl_account_code || ''
  },
  {
    id: 'gl_account_name',
    label: 'GL Account Name',
    key: 'gl_account_name',
    selected: false,
    format: 'text',
    accessor: (transaction, suggestion) => suggestion?.gl_account_name || ''
  },
  {
    id: 'debit_credit_indicator',
    label: 'Debit/Credit',
    key: 'debit_credit_indicator',
    selected: true,
    format: 'text',
    accessor: (transaction, suggestion) => suggestion?.debit_credit_indicator || ''
  },
  {
    id: 'confidence_score',
    label: 'Confidence Score',
    key: 'confidence_score',
    selected: true,
    format: 'percentage',
    accessor: (transaction, suggestion) => suggestion?.confidence_score || 0
  },
  {
    id: 'approval_status',
    label: 'Approval Status',
    key: 'approval_status',
    selected: true,
    format: 'text',
    accessor: (transaction, suggestion) => suggestion?.approval_status || 'N/A'
  },
  {
    id: 'approved_by',
    label: 'Approved By',
    key: 'approved_by',
    selected: false,
    format: 'text',
    accessor: (transaction, suggestion) => suggestion?.approved_by || ''
  },
  {
    id: 'approved_at',
    label: 'Approved At',
    key: 'approved_at',
    selected: false,
    format: 'date',
    accessor: (transaction, suggestion) => suggestion?.approved_at || ''
  },
  {
    id: 'created_at',
    label: 'Created At',
    key: 'created_at',
    selected: false,
    format: 'date'
  },
  {
    id: 'updated_at',
    label: 'Updated At',
    key: 'updated_at',
    selected: false,
    format: 'date'
  }
];

const DEFAULT_TEMPLATES: ExportTemplate[] = [
  {
    id: 'basic-export',
    name: 'Basic Export',
    description: 'Essential transaction information',
    format: 'csv',
    columns: ['transaction_id', 'description', 'amount', 'transaction_date', 'account_id']
  },
  {
    id: 'accounting-export',
    name: 'Accounting Export',
    description: 'Complete data for accounting purposes',
    format: 'excel',
    columns: ['transaction_id', 'description', 'amount', 'transaction_date', 'account_id', 'currency_code', 'gl_account_code', 'debit_credit_indicator', 'approval_status']
  },
  {
    id: 'audit-export',
    name: 'Audit Export',
    description: 'Full audit trail with confidence scores',
    format: 'excel',
    columns: ['transaction_id', 'description', 'amount', 'transaction_date', 'gl_account_code', 'confidence_score', 'approval_status', 'approved_by', 'approved_at', 'created_at']
  },
  {
    id: 'summary-report',
    name: 'Summary Report',
    description: 'PDF summary for management reporting',
    format: 'pdf',
    columns: ['transaction_id', 'description', 'amount', 'gl_account_code', 'approval_status']
  }
];

export function TransactionExport({
  transactions,
  suggestions = [],
  selectedTransactionIds = [],
  filters,
  onExport,
  className = '',
  enableTemplates = true,
  templates = DEFAULT_TEMPLATES,
  onSaveTemplate,
  onLoadTemplate,
  onDeleteTemplate,
  maxExportSize = 100000
}: TransactionExportProps) {
  const [selectedFormat, setSelectedFormat] = useState<string>('csv');
  const [columns, setColumns] = useState<ExportColumn[]>(DEFAULT_COLUMNS);
  const [isExporting, setIsExporting] = useState(false);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [dateFormat, setDateFormat] = useState('yyyy-MM-dd HH:mm:ss');

  // Get transactions to export
  const transactionsToExport = useMemo(() => {
    if (selectedTransactionIds.length > 0) {
      return transactions.filter(t => selectedTransactionIds.includes(t.transaction_id));
    }
    return transactions;
  }, [transactions, selectedTransactionIds]);

  // Get suggestions map for enrichment
  const suggestionsMap = useMemo(() => {
    const map = new Map<string, CashClearingSuggestion>();
    suggestions.forEach(s => map.set(s.transaction_id, s));
    return map;
  }, [suggestions]);

  // Calculate export stats
  const exportStats = useMemo(() => {
    const selectedColumns = columns.filter(c => c.selected);
    const estimatedSize = transactionsToExport.length * selectedColumns.length * 50; // rough estimate
    const format = EXPORT_FORMATS.find(f => f.id === selectedFormat);
    const exceedsLimit = format?.maxRows && transactionsToExport.length > format.maxRows;
    const tooLarge = estimatedSize > maxExportSize * 1024; // convert to bytes

    return {
      rowCount: transactionsToExport.length,
      columnCount: selectedColumns.length,
      estimatedSize,
      exceedsLimit,
      tooLarge,
      canExport: !exceedsLimit && !tooLarge && selectedColumns.length > 0
    };
  }, [transactionsToExport, columns, selectedFormat, maxExportSize]);

  // Format value based on column type
  const formatValue = useCallback((value: any, columnFormat?: string): any => {
    if (value === null || value === undefined) return '';

    switch (columnFormat) {
      case 'currency':
        return typeof value === 'number' 
          ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
          : value;
      case 'percentage':
        return typeof value === 'number' 
          ? `${(value * 100).toFixed(1)}%`
          : value;
      case 'date':
        try {
          return value ? format(new Date(value), dateFormat) : '';
        } catch {
          return value;
        }
      case 'boolean':
        return value ? 'Yes' : 'No';
      case 'number':
        return typeof value === 'number' ? value.toLocaleString() : value;
      default:
        return value;
    }
  }, [dateFormat]);

  // Generate export data
  const generateExportData = useCallback(() => {
    const selectedColumns = columns.filter(c => c.selected);
    const data: any[] = [];

    // Add metadata if enabled
    if (includeMetadata && selectedFormat !== 'pdf') {
      data.push({
        '// Export Metadata': '',
        '// Generated': new Date().toISOString(),
        '// Total Rows': transactionsToExport.length,
        '// Filters Applied': filters ? JSON.stringify(filters) : 'None',
        '// Format': selectedFormat.toUpperCase()
      });
      data.push({}); // Empty row for separation
    }

    // Add header row for CSV/Excel
    if (selectedFormat === 'csv' || selectedFormat === 'excel') {
      const header: Record<string, string> = {};
      selectedColumns.forEach(col => {
        header[col.id] = col.label;
      });
      data.push(header);
    }

    // Add data rows
    transactionsToExport.forEach(transaction => {
      const suggestion = suggestionsMap.get(transaction.transaction_id);
      const row: Record<string, any> = {};

      selectedColumns.forEach(col => {
        let value: any;
        
        if (col.accessor) {
          value = col.accessor(transaction, suggestion);
        } else {
          value = transaction[col.key as keyof CashTransaction];
        }

        row[selectedFormat === 'json' ? col.key : col.id] = formatValue(value, col.format);
      });

      data.push(row);
    });

    return data;
  }, [
    columns, transactionsToExport, suggestionsMap, includeMetadata, 
    selectedFormat, filters, formatValue
  ]);

  // Handle export
  const handleExport = useCallback(async () => {
    if (!exportStats.canExport || !onExport) return;

    setIsExporting(true);
    try {
      const data = generateExportData();
      const timestamp = format(new Date(), 'yyyy-MM-dd-HHmmss');
      const filename = `transactions-export-${timestamp}.${EXPORT_FORMATS.find(f => f.id === selectedFormat)?.extension}`;
      
      await onExport(data, selectedFormat, filename);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  }, [exportStats.canExport, onExport, generateExportData, selectedFormat]);

  // Handle column selection
  const handleColumnToggle = useCallback((columnId: string) => {
    setColumns(prev => prev.map(col => 
      col.id === columnId ? { ...col, selected: !col.selected } : col
    ));
  }, []);

  const handleSelectAllColumns = useCallback(() => {
    setColumns(prev => prev.map(col => ({ ...col, selected: true })));
  }, []);

  const handleDeselectAllColumns = useCallback(() => {
    setColumns(prev => prev.map(col => ({ ...col, selected: false })));
  }, []);

  // Handle template operations
  const handleLoadTemplate = useCallback((template: ExportTemplate) => {
    setSelectedFormat(template.format);
    setColumns(prev => prev.map(col => ({
      ...col,
      selected: template.columns.includes(col.id)
    })));
    
    if (onLoadTemplate) {
      onLoadTemplate(template);
    }
    
    setShowTemplates(false);
  }, [onLoadTemplate]);

  const handleSaveTemplate = useCallback(() => {
    if (!templateName.trim() || !onSaveTemplate) return;

    const selectedColumnIds = columns.filter(c => c.selected).map(c => c.id);
    
    onSaveTemplate({
      name: templateName.trim(),
      description: templateDescription.trim() || undefined,
      format: selectedFormat,
      columns: selectedColumnIds,
      filters
    });

    setTemplateName('');
    setTemplateDescription('');
    setShowSaveTemplate(false);
  }, [templateName, templateDescription, selectedFormat, columns, filters, onSaveTemplate]);

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Export Transactions
          </h3>
          
          <div className="flex items-center space-x-2">
            {enableTemplates && (
              <>
                <button
                  onClick={() => setShowSaveTemplate(true)}
                  disabled={!exportStats.canExport}
                  className="px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 rounded-md hover:bg-blue-200 dark:hover:bg-blue-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Save Template
                </button>
                
                <button
                  onClick={() => setShowTemplates(!showTemplates)}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Templates
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Export Stats */}
      <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-gray-500 dark:text-gray-400">Transactions</div>
            <div className="font-semibold text-gray-900 dark:text-gray-100">
              {exportStats.rowCount.toLocaleString()}
            </div>
          </div>
          
          <div>
            <div className="text-gray-500 dark:text-gray-400">Columns</div>
            <div className="font-semibold text-gray-900 dark:text-gray-100">
              {exportStats.columnCount}
            </div>
          </div>
          
          <div>
            <div className="text-gray-500 dark:text-gray-400">Est. Size</div>
            <div className="font-semibold text-gray-900 dark:text-gray-100">
              {(exportStats.estimatedSize / 1024).toFixed(1)} KB
            </div>
          </div>
          
          <div>
            <div className="text-gray-500 dark:text-gray-400">Status</div>
            <div className={`font-semibold ${
              exportStats.canExport 
                ? 'text-green-600 dark:text-green-400' 
                : 'text-red-600 dark:text-red-400'
            }`}>
              {exportStats.canExport ? 'Ready' : 'Error'}
            </div>
          </div>
        </div>
        
        {!exportStats.canExport && (
          <div className="mt-2 text-sm text-red-600 dark:text-red-400">
            {exportStats.exceedsLimit && `Format limit exceeded (max ${EXPORT_FORMATS.find(f => f.id === selectedFormat)?.maxRows?.toLocaleString()} rows)`}
            {exportStats.tooLarge && 'Export size too large'}
            {exportStats.columnCount === 0 && 'No columns selected'}
          </div>
        )}
      </div>

      {/* Templates Panel */}
      {showTemplates && (
        <div className="px-6 py-4 bg-blue-50 dark:bg-blue-900/20 border-b border-gray-200 dark:border-gray-700">
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Export Templates</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {templates.map((template) => (
                <div key={template.id} className="group relative">
                  <button
                    onClick={() => handleLoadTemplate(template)}
                    className="w-full text-left p-3 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-center space-x-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        template.format === 'csv' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
                        template.format === 'excel' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                        template.format === 'json' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' :
                        'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                      }`}>
                        {template.format.toUpperCase()}
                      </span>
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        {template.name}
                      </div>
                    </div>
                    {template.description && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {template.description}
                      </div>
                    )}
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {template.columns.length} columns
                    </div>
                  </button>
                  
                  {onDeleteTemplate && !DEFAULT_TEMPLATES.some(t => t.id === template.id) && (
                    <button
                      onClick={() => onDeleteTemplate(template.id)}
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

      {/* Save Template Panel */}
      {showSaveTemplate && (
        <div className="px-6 py-4 bg-green-50 dark:bg-green-900/20 border-b border-gray-200 dark:border-gray-700">
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Save Export Template</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Template name"
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <input
                type="text"
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                placeholder="Description (optional)"
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex space-x-2">
              <button
                onClick={handleSaveTemplate}
                disabled={!templateName.trim()}
                className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setShowSaveTemplate(false);
                  setTemplateName('');
                  setTemplateDescription('');
                }}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Configuration */}
      <div className="px-6 py-4 space-y-6">
        {/* Format Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Export Format
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {EXPORT_FORMATS.map((format) => (
              <label
                key={format.id}
                className={`relative p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  selectedFormat === format.id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <input
                  type="radio"
                  value={format.id}
                  checked={selectedFormat === format.id}
                  onChange={(e) => setSelectedFormat(e.target.value)}
                  className="sr-only"
                />
                
                <div className="flex items-center space-x-3">
                  <div className={`flex-shrink-0 ${
                    selectedFormat === format.id 
                      ? 'text-blue-600 dark:text-blue-400' 
                      : 'text-gray-400 dark:text-gray-500'
                  }`}>
                    {format.icon}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {format.name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {format.description}
                    </div>
                    {format.maxRows && (
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        Max {format.maxRows.toLocaleString()} rows
                      </div>
                    )}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Column Selection */}
        {EXPORT_FORMATS.find(f => f.id === selectedFormat)?.supportsCustomColumns && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Columns to Export
              </label>
              
              <div className="flex space-x-2">
                <button
                  onClick={() => setShowColumnSelector(!showColumnSelector)}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                >
                  {showColumnSelector ? 'Hide' : 'Show'} Columns
                </button>
                <button
                  onClick={handleSelectAllColumns}
                  className="text-sm text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300"
                >
                  Select All
                </button>
                <button
                  onClick={handleDeselectAllColumns}
                  className="text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                >
                  Deselect All
                </button>
              </div>
            </div>

            {showColumnSelector && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md p-3">
                {columns.map((column) => (
                  <label key={column.id} className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={column.selected}
                      onChange={() => handleColumnToggle(column.id)}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                    />
                    <span className="text-gray-900 dark:text-gray-100">
                      {column.label}
                    </span>
                  </label>
                ))}
              </div>
            )}
            
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              {columns.filter(c => c.selected).length} of {columns.length} columns selected
            </div>
          </div>
        )}

        {/* Export Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="flex items-center space-x-2 text-sm">
              <input
                type="checkbox"
                checked={includeMetadata}
                onChange={(e) => setIncludeMetadata(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-gray-900 dark:text-gray-100">
                Include metadata
              </span>
            </label>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Date Format
            </label>
            <select
              value={dateFormat}
              onChange={(e) => setDateFormat(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              <option value="yyyy-MM-dd HH:mm:ss">2024-01-15 14:30:00</option>
              <option value="yyyy-MM-dd">2024-01-15</option>
              <option value="MM/dd/yyyy">01/15/2024</option>
              <option value="dd/MM/yyyy">15/01/2024</option>
              <option value="MMM dd, yyyy">Jan 15, 2024</option>
            </select>
          </div>
        </div>
      </div>

      {/* Export Actions */}
      <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {selectedTransactionIds.length > 0 
              ? `Exporting ${selectedTransactionIds.length} selected transactions`
              : `Exporting all ${transactionsToExport.length} transactions`
            }
          </div>
          
          <button
            onClick={handleExport}
            disabled={!exportStats.canExport || isExporting}
            className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isExporting ? 'Exporting...' : `Export ${selectedFormat.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}