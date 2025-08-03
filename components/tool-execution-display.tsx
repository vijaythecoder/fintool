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
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
      </svg>
    );
  };

  const getStateConfig = (state: string) => {
    switch (state) {
      case 'input-streaming':
        return {
          color: 'blue',
          label: 'Preparing',
          icon: (
            <div className="animate-spin w-4 h-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 11-6.219-8.56"/>
              </svg>
            </div>
          ),
          description: 'Setting up query parameters...'
        };
      case 'input-available':
        return {
          color: 'amber',
          label: 'Executing',
          icon: (
            <div className="animate-pulse w-4 h-4">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          ),
          description: 'Running query on BigQuery...'
        };
      case 'output-available':
        return {
          color: 'green',
          label: 'Completed',
          icon: (
            <div className="w-4 h-4">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
            </div>
          ),
          description: 'Query executed successfully'
        };
      case 'output-error':
        return {
          color: 'red',
          label: 'Failed',
          icon: (
            <div className="w-4 h-4">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </div>
          ),
          description: 'Query execution failed'
        };
      default:
        return {
          color: 'gray',
          label: 'Unknown',
          icon: (
            <div className="w-4 h-4">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
              </svg>
            </div>
          ),
          description: 'Processing...'
        };
    }
  };

  const stateConfig = getStateConfig(part.state);
  const toolName = part.toolName || 'Tool';

  return (
    <div className="mt-3 space-y-3">
      {/* Tool Execution Header */}
      <div className={`
        bg-gradient-to-r rounded-lg p-4 border-l-4 transition-all duration-300
        ${stateConfig.color === 'blue' ? 'from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border-blue-400 dark:border-blue-500' : ''}
        ${stateConfig.color === 'amber' ? 'from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-amber-400 dark:border-amber-500' : ''}
        ${stateConfig.color === 'green' ? 'from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-400 dark:border-green-500' : ''}
        ${stateConfig.color === 'red' ? 'from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 border-red-400 dark:border-red-500' : ''}
        ${stateConfig.color === 'gray' ? 'from-gray-50 to-slate-50 dark:from-gray-900/20 dark:to-slate-900/20 border-gray-400 dark:border-gray-500' : ''}
      `}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`
              p-2 rounded-full
              ${stateConfig.color === 'blue' ? 'bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300' : ''}
              ${stateConfig.color === 'amber' ? 'bg-amber-100 dark:bg-amber-800 text-amber-600 dark:text-amber-300' : ''}
              ${stateConfig.color === 'green' ? 'bg-green-100 dark:bg-green-800 text-green-600 dark:text-green-300' : ''}
              ${stateConfig.color === 'red' ? 'bg-red-100 dark:bg-red-800 text-red-600 dark:text-red-300' : ''}
              ${stateConfig.color === 'gray' ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300' : ''}
            `}>
              {getToolIcon(toolName)}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h4 className={`
                  font-semibold text-sm
                  ${stateConfig.color === 'blue' ? 'text-blue-900 dark:text-blue-100' : ''}
                  ${stateConfig.color === 'amber' ? 'text-amber-900 dark:text-amber-100' : ''}
                  ${stateConfig.color === 'green' ? 'text-green-900 dark:text-green-100' : ''}
                  ${stateConfig.color === 'red' ? 'text-red-900 dark:text-red-100' : ''}
                  ${stateConfig.color === 'gray' ? 'text-gray-900 dark:text-gray-100' : ''}
                `}>
                  {toolName}
                </h4>
                <span className={`
                  px-2 py-1 text-xs font-medium rounded-full
                  ${stateConfig.color === 'blue' ? 'bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200' : ''}
                  ${stateConfig.color === 'amber' ? 'bg-amber-100 dark:bg-amber-800 text-amber-700 dark:text-amber-200' : ''}
                  ${stateConfig.color === 'green' ? 'bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-200' : ''}
                  ${stateConfig.color === 'red' ? 'bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-200' : ''}
                  ${stateConfig.color === 'gray' ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200' : ''}
                `}>
                  {stateConfig.label}
                </span>
              </div>
              <p className={`
                text-xs mt-1
                ${stateConfig.color === 'blue' ? 'text-blue-700 dark:text-blue-300' : ''}
                ${stateConfig.color === 'amber' ? 'text-amber-700 dark:text-amber-300' : ''}
                ${stateConfig.color === 'green' ? 'text-green-700 dark:text-green-300' : ''}
                ${stateConfig.color === 'red' ? 'text-red-700 dark:text-red-300' : ''}
                ${stateConfig.color === 'gray' ? 'text-gray-700 dark:text-gray-300' : ''}
              `}>
                {stateConfig.description}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            {(part.state === 'input-streaming' || part.state === 'input-available') && (
              <div className={`
                text-xs font-mono
                ${stateConfig.color === 'blue' ? 'text-blue-600 dark:text-blue-400' : ''}
                ${stateConfig.color === 'amber' ? 'text-amber-600 dark:text-amber-400' : ''}
              `}>
                {formatDuration(duration)}
              </div>
            )}
            <div className={`
              ${stateConfig.color === 'blue' ? 'text-blue-600 dark:text-blue-400' : ''}
              ${stateConfig.color === 'amber' ? 'text-amber-600 dark:text-amber-400' : ''}
              ${stateConfig.color === 'green' ? 'text-green-600 dark:text-green-400' : ''}
              ${stateConfig.color === 'red' ? 'text-red-600 dark:text-red-400' : ''}
              ${stateConfig.color === 'gray' ? 'text-gray-600 dark:text-gray-400' : ''}
            `}>
              {stateConfig.icon}
            </div>
          </div>
        </div>

        {/* Progress bar for active states */}
        {(part.state === 'input-streaming' || part.state === 'input-available') && (
          <div className="mt-3">
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
              <div className={`
                h-1 rounded-full transition-all duration-300
                ${stateConfig.color === 'blue' ? 'bg-blue-500' : ''}
                ${stateConfig.color === 'amber' ? 'bg-amber-500' : ''}
                ${part.state === 'input-streaming' ? 'w-1/3 animate-pulse' : 'w-2/3'}
              `}></div>
            </div>
          </div>
        )}
      </div>

      {/* Tool Output */}
      {part.state === 'output-available' && (
        <div className="ml-4">
          <BigQueryResultDisplay output={part.output} toolName={toolName} />
        </div>
      )}

      {part.state === 'output-error' && (
        <div className="ml-4">
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

      {/* Tool Input Display (for debugging/transparency) */}
      {part.state === 'input-available' && part.input && (
        <details className="ml-4 group">
          <summary className="cursor-pointer text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
            View query parameters
          </summary>
          <div className="mt-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3">
            <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto">
              {typeof part.input === 'string' ? part.input : JSON.stringify(part.input, null, 2)}
            </pre>
          </div>
        </details>
      )}
    </div>
  );
}