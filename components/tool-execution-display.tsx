'use client';

import { useState, useEffect } from 'react';
import { BigQueryResultDisplay } from './bigquery-result-display';

interface ToolExecutionDisplayProps {
  part: any;
  index: number;
}

export function ToolExecutionDisplay({ part, index }: ToolExecutionDisplayProps) {
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (part.state === 'input-streaming' || part.state === 'input-available') {
      const start = Date.now();
      setStartTime(start);
      const interval = setInterval(() => {
        setDuration(Date.now() - start);
      }, 100);

      return () => clearInterval(interval);
    }
  }, [part.state]);

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getToolIcon = (toolName: string) => {
    if (toolName?.toLowerCase().includes('bigquery')) {
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
          <path d="M12 2l2.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          <circle cx="12" cy="12" r="3" fillOpacity="0.4"/>
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"/>
      </svg>
    );
  };

  const getFormattedToolName = (toolName: string) => {
    if (toolName?.toLowerCase().includes('bigquery') || toolName?.toLowerCase() === 'query') {
      return 'BigQuery Database Tool';
    }
    return toolName || 'Database Tool';
  };

  const getQuerySummary = (input: any) => {
    if (!input) return null;
    
    const inputStr = typeof input === 'string' ? input : JSON.stringify(input);
    
    // Try to extract query from common patterns
    const queryMatch = inputStr.match(/"query":\s*"([^"]+)"/);
    if (queryMatch) {
      const query = queryMatch[1].replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
      
      // Create a human-readable summary
      if (query.toLowerCase().includes('select')) {
        const tableMatch = query.match(/from\s+[`"]?([^`"\s,]+)[`"]?/i);
        const limitMatch = query.match(/limit\s+(\d+)/i);
        const whereMatch = query.toLowerCase().includes('where');
        const countMatch = query.toLowerCase().includes('count(');
        
        let summary = countMatch ? 'Counted records' : 'Selected data';
        
        if (tableMatch) {
          const tableName = tableMatch[1].split('.').pop(); // Get table name without schema
          summary += ` from ${tableName}`;
        }
        
        if (whereMatch && !countMatch) {
          summary += ' (filtered)';
        }
        
        if (limitMatch) {
          summary += ` (${limitMatch[1]} rows)`;
        }
        
        return summary;
      } else if (query.toLowerCase().includes('information_schema.columns')) {
        return 'Retrieved table schema information';
      } else if (query.toLowerCase().includes('information_schema.tables')) {
        return 'Listed available tables';
      } else if (query.toLowerCase().includes('information_schema.schemata')) {
        return 'Listed available datasets';
      } else if (query.toLowerCase().includes('describe') || query.toLowerCase().includes('show')) {
        return 'Retrieved metadata information';
      }
    }
    
    return 'Executed database query';
  };

  const toolName = part.toolName || 'Tool';
  const formattedToolName = getFormattedToolName(toolName);
  const querySummary = getQuerySummary(part.input);

  // For completed tools, default to collapsed state
  const defaultExpanded = part.state !== 'output-available';

  return (
    <div className="mt-3">
      {/* Collapsible Tool Card */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-all duration-200">
        {/* Card Header - Always Visible */}
        <div 
          className="px-4 py-3 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {/* Tool Icon */}
              <div className={`
                p-2 rounded-lg transition-colors
                ${part.state === 'output-available' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : ''}
                ${part.state === 'input-streaming' || part.state === 'input-available' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : ''}
                ${part.state === 'output-error' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : ''}
              `}>
                {getToolIcon(toolName)}
              </div>
              
              {/* Tool Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {formattedToolName}
                  </h3>
                  
                  {/* Status Badge */}
                  <span className={`
                    inline-flex items-center px-2 py-1 text-xs font-medium rounded-full
                    ${part.state === 'output-available' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : ''}
                    ${part.state === 'input-streaming' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : ''}
                    ${part.state === 'input-available' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' : ''}
                    ${part.state === 'output-error' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' : ''}
                  `}>
                    {part.state === 'output-available' && '✓ Completed'}
                    {part.state === 'input-streaming' && '⏳ Preparing'}
                    {part.state === 'input-available' && '▶ Running'}
                    {part.state === 'output-error' && '✗ Failed'}
                  </span>
                  
                  {/* Duration for active states */}
                  {(part.state === 'input-streaming' || part.state === 'input-available') && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                      {formatDuration(duration)}
                    </span>
                  )}
                </div>
                
                {/* Query Summary */}
                {querySummary && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                    {querySummary}
                  </p>
                )}
              </div>
            </div>
            
            {/* Expand/Collapse Button */}
            <div className="flex items-center space-x-2">
              {/* Progress indicator for active states */}
              {(part.state === 'input-streaming' || part.state === 'input-available') && (
                <div className="w-4 h-4">
                  {part.state === 'input-streaming' ? (
                    <div className="animate-spin w-4 h-4 text-blue-500">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 11-6.219-8.56"/>
                      </svg>
                    </div>
                  ) : (
                    <div className="animate-pulse w-4 h-4 text-amber-500">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </div>
                  )}
                </div>
              )}
              
              {/* Chevron */}
              <div className={`
                w-5 h-5 text-gray-400 dark:text-gray-500 transition-transform duration-200
                ${isExpanded ? 'rotate-180' : ''}
              `}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </div>
            </div>
          </div>
          
          {/* Progress bar for active states */}
          {(part.state === 'input-streaming' || part.state === 'input-available') && (
            <div className="mt-3">
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                <div className={`
                  h-1 rounded-full transition-all duration-300
                  ${part.state === 'input-streaming' ? 'bg-blue-500 w-1/3 animate-pulse' : 'bg-amber-500 w-2/3'}
                `}></div>
              </div>
            </div>
          )}
        </div>
        
        {/* Expandable Content */}
        <div className={`
          overflow-hidden transition-all duration-300 ease-in-out
          ${isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}
        `}>
          <div className="border-t border-gray-100 dark:border-gray-700">
            {/* Query Parameters */}
            {part.input && (
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50">
                <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Query Parameters:</h4>
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded p-3">
                  <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap">
                    {typeof part.input === 'string' ? part.input : JSON.stringify(part.input, null, 2)}
                  </pre>
                </div>
              </div>
            )}
            
            {/* Results */}
            {part.state === 'output-available' && (
              <div className="p-4">
                <BigQueryResultDisplay output={part.output} toolName={formattedToolName} />
              </div>
            )}
            
            {/* Error Display */}
            {part.state === 'output-error' && (
              <div className="p-4">
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <div className="flex items-center space-x-2">
                    <div className="w-5 h-5 text-red-500">
                      <svg viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <span className="text-red-700 dark:text-red-300 font-medium">Execution Error</span>
                  </div>
                  <p className="mt-2 text-red-700 dark:text-red-300 text-sm">
                    {part.errorText || 'An unknown error occurred during tool execution.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}