'use client';

import { useState } from 'react';
import { FinancialDataTable } from './financial-data-table';

interface SchemaColumn {
  column_name: string;
  data_type: string;
  is_nullable?: string;
  description?: string;
}

interface BigQueryResultDisplayProps {
  output: any;
  toolName?: string;
}

export function BigQueryResultDisplay({ output, toolName }: BigQueryResultDisplayProps) {
  const [expandedJson, setExpandedJson] = useState(false);

  if (!output) {
    return (
      <div className="text-gray-500 dark:text-gray-400 text-sm">
        No output available
      </div>
    );
  }

  // Handle MCP response format {content, isError}
  if (typeof output === 'object' && 'content' in output) {
    if (output.isError) {
      return (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <div className="w-5 h-5 text-red-500">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <span className="text-red-700 dark:text-red-300 font-medium">Error</span>
          </div>
          <p className="mt-2 text-red-700 dark:text-red-300 text-sm">
            {output.content}
          </p>
        </div>
      );
    }

    // Try to parse content as JSON for better display
    try {
      const parsed = typeof output.content === 'string' 
        ? JSON.parse(output.content) 
        : output.content;
      
      return <BigQueryDataRenderer data={parsed} toolName={toolName} />;
    } catch {
      // If not JSON, display content as-is with nice formatting
      return (
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Result from {toolName || 'BigQuery'}
          </div>
          <div className="whitespace-pre-wrap text-gray-900 dark:text-gray-100 text-sm font-mono">
            {String(output.content)}
          </div>
        </div>
      );
    }
  }

  // Handle string output
  if (typeof output === 'string') {
    try {
      const parsed = JSON.parse(output);
      return <BigQueryDataRenderer data={parsed} toolName={toolName} />;
    } catch {
      return (
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Result from {toolName || 'BigQuery'}
          </div>
          <div className="text-gray-900 dark:text-gray-100 text-sm">
            {output}
          </div>
        </div>
      );
    }
  }

  // Fallback for other types
  return <BigQueryDataRenderer data={output} toolName={toolName} />;
}

function BigQueryDataRenderer({ data, toolName }: { data: any; toolName?: string }) {
  const [expandedJson, setExpandedJson] = useState(false);

  // Check if this is schema information
  if (Array.isArray(data) && data.length > 0 && 
      data[0].column_name && data[0].data_type) {
    return <SchemaDisplay schema={data} />;
  }

  // Check if this is financial transaction data
  if (Array.isArray(data) && data.length > 0 && 
      (data[0].transaction_id || data[0].transaction_amount || 
       data[0].customer_account || data[0].amount)) {
    return <FinancialDataTable data={data} title="Query Results" />;
  }

  // Check if this is a query result with multiple rows
  if (Array.isArray(data) && data.length > 0) {
    return <GenericDataTable data={data} toolName={toolName} />;
  }

  // Check if this is a single object result
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    return <ObjectDisplay object={data} toolName={toolName} />;
  }

  // For simple values or other types
  return (
    <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
        Result from {toolName || 'BigQuery'}
      </div>
      <div className="text-gray-900 dark:text-gray-100">
        {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
      </div>
    </div>
  );
}

function SchemaDisplay({ schema }: { schema: SchemaColumn[] }) {
  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 my-4">
      <div className="flex items-center space-x-2 mb-4">
        <div className="w-6 h-6 text-blue-600 dark:text-blue-400">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"/>
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">
          Table Schema
        </h3>
        <span className="bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 text-xs px-2 py-1 rounded-full">
          {schema.length} columns
        </span>
      </div>
      
      <div className="grid gap-3">
        {schema.map((column, index) => (
          <div
            key={index}
            className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-blue-100 dark:border-blue-700 rounded-lg p-3 hover:shadow-md transition-all duration-200"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">
                  {column.column_name}
                </div>
                {column.description && (
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    {column.description}
                  </div>
                )}
              </div>
              <div className="flex items-center space-x-2 ml-4">
                <span className={`px-2 py-1 text-xs font-medium rounded ${
                  getDataTypeColor(column.data_type)
                }`}>
                  {column.data_type}
                </span>
                {column.is_nullable === 'YES' && (
                  <span className="px-2 py-1 text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 rounded">
                    nullable
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GenericDataTable({ data, toolName }: { data: any[]; toolName?: string }) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div className="text-gray-500 dark:text-gray-400 text-center py-4">
        No data available
      </div>
    );
  }

  // Get all unique keys from the data
  const allKeys = Array.from(
    new Set(data.flatMap(item => Object.keys(item)))
  );

  const formatValue = (value: any) => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const formatHeader = (key: string) => {
    return key
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  return (
    <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 my-4">
      <div className="flex items-center space-x-2 mb-4">
        <div className="w-6 h-6 text-green-600 dark:text-green-400">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-green-900 dark:text-green-100">
          {toolName || 'Query'} Results
        </h3>
        <span className="bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-200 text-xs px-2 py-1 rounded-full">
          {data.length} {data.length === 1 ? 'row' : 'rows'}
        </span>
      </div>
      
      <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg border border-green-100 dark:border-green-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-green-200 dark:divide-green-700">
            <thead className="bg-green-100/50 dark:bg-green-800/50">
              <tr>
                {allKeys.map((key) => (
                  <th
                    key={key}
                    className="px-4 py-3 text-left text-xs font-medium text-green-700 dark:text-green-300 uppercase tracking-wider"
                  >
                    {formatHeader(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-green-100 dark:divide-green-800">
              {data.map((item, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors"
                >
                  {allKeys.map((key) => (
                    <td
                      key={key}
                      className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap"
                    >
                      {formatValue(item[key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ObjectDisplay({ object, toolName }: { object: any; toolName?: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4 my-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 text-purple-600 dark:text-purple-400">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-purple-900 dark:text-purple-100">
            {toolName || 'Query'} Result
          </h3>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200 transition-colors"
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>
      
      <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg border border-purple-100 dark:border-purple-700 p-4">
        {expanded ? (
          <pre className="text-sm text-gray-900 dark:text-gray-100 overflow-x-auto">
            {JSON.stringify(object, null, 2)}
          </pre>
        ) : (
          <div className="space-y-2">
            {Object.entries(object).slice(0, 5).map(([key, value]) => (
              <div key={key} className="flex items-start space-x-2">
                <span className="font-mono text-sm font-medium text-purple-700 dark:text-purple-300 min-w-0 flex-shrink-0">
                  {key}:
                </span>
                <span className="text-sm text-gray-900 dark:text-gray-100 truncate">
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </span>
              </div>
            ))}
            {Object.keys(object).length > 5 && (
              <div className="text-sm text-gray-500 dark:text-gray-400 italic">
                ... and {Object.keys(object).length - 5} more properties
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function getDataTypeColor(dataType: string): string {
  const type = dataType.toLowerCase();
  if (type.includes('string') || type.includes('text')) {
    return 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300';
  }
  if (type.includes('int') || type.includes('number') || type.includes('numeric')) {
    return 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300';
  }
  if (type.includes('date') || type.includes('time')) {
    return 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300';
  }
  if (type.includes('bool')) {
    return 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300';
  }
  return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300';
}