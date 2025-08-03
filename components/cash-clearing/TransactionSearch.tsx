'use client';

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation';
import type { CashTransaction, CashClearingSuggestion } from '../../lib/types';

export interface SearchSuggestion {
  id: string;
  type: 'transaction' | 'description' | 'reference' | 'account' | 'pattern' | 'gl_account';
  value: string;
  label: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface TransactionSearchProps {
  onSearch: (query: string, suggestions?: SearchSuggestion[]) => void;
  onSuggestionSelect?: (suggestion: SearchSuggestion) => void;
  transactions?: CashTransaction[];
  suggestions?: CashClearingSuggestion[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  enableAutocomplete?: boolean;
  enableSmartSearch?: boolean;
  maxSuggestions?: number;
  searchDelay?: number;
  showSearchHistory?: boolean;
  searchHistory?: string[];
  onSearchHistoryChange?: (history: string[]) => void;
}

interface SearchToken {
  type: 'field' | 'operator' | 'value' | 'text';
  value: string;
  field?: string;
  operator?: string;
}

const SEARCH_OPERATORS = [':', '=', '>', '<', '>=', '<=', '!=', 'contains', 'starts', 'ends'];
const SEARCH_FIELDS = [
  'id', 'description', 'amount', 'date', 'account', 'currency', 'pattern', 
  'gl_account', 'confidence', 'status', 'batch', 'reference'
];

const FIELD_MAPPINGS: Record<string, string> = {
  'id': 'transaction_id',
  'desc': 'description',
  'description': 'description',
  'amount': 'amount',
  'date': 'transaction_date',
  'account': 'account_id',
  'currency': 'currency_code',
  'pattern': 'pattern',
  'gl': 'gl_account_code',
  'gl_account': 'gl_account_code',
  'confidence': 'confidence_score',
  'status': 'approval_status',
  'batch': 'batch_id',
  'ref': 'reference_number',
  'reference': 'reference_number'
};

export function TransactionSearch({
  onSearch,
  onSuggestionSelect,
  transactions = [],
  suggestions = [],
  placeholder = 'Search transactions... (e.g., amount>1000, status:pending, description contains "payment")',
  disabled = false,
  className = '',
  enableAutocomplete = true,
  enableSmartSearch = true,
  maxSuggestions = 10,
  searchDelay = 300,
  showSearchHistory = true,
  searchHistory = [],
  onSearchHistoryChange
}: TransactionSearchProps) {
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [showHistory, setShowHistory] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Generate search suggestions based on current query
  const searchSuggestions = useMemo((): SearchSuggestion[] => {
    if (!enableAutocomplete || query.length < 2) return [];

    const searchSuggestionsList: SearchSuggestion[] = [];
    const lowerQuery = query.toLowerCase();

    // Parse current query to understand context
    const tokens = parseSearchQuery(query);
    const lastToken = tokens[tokens.length - 1];
    const isInFieldContext = lastToken?.type === 'field' || query.endsWith(':');
    const isInValueContext = tokens.some(t => t.type === 'operator');

    if (isInFieldContext) {
      // Suggest field values
      const field = lastToken?.field || extractFieldFromQuery(query);
      if (field) {
        const fieldSuggestions = getFieldValueSuggestions(field, lowerQuery);
        searchSuggestionsList.push(...fieldSuggestions.slice(0, maxSuggestions));
      }
    } else {
      // Suggest fields, operators, and general search
      
      // Field suggestions
      SEARCH_FIELDS.forEach(field => {
        if (field.toLowerCase().includes(lowerQuery)) {
          searchSuggestionsList.push({
            id: `field-${field}`,
            type: 'pattern',
            value: `${field}:`,
            label: `${field}:`,
            description: `Search by ${field}`
          });
        }
      });

      // Transaction ID suggestions
      transactions.forEach(transaction => {
        if (transaction.transaction_id.toLowerCase().includes(lowerQuery)) {
          searchSuggestionsList.push({
            id: `transaction-${transaction.transaction_id}`,
            type: 'transaction',
            value: transaction.transaction_id,
            label: `ID: ${transaction.transaction_id.substring(0, 12)}...`,
            description: transaction.description,
            metadata: { transaction }
          });
        }
      });

      // Description suggestions
      const uniqueDescriptions = new Set<string>();
      transactions.forEach(transaction => {
        const desc = transaction.description?.toLowerCase() || '';
        if (desc.includes(lowerQuery) && !uniqueDescriptions.has(desc)) {
          uniqueDescriptions.add(desc);
          searchSuggestionsList.push({
            id: `description-${transaction.transaction_id}`,
            type: 'description',
            value: `description contains "${transaction.description}"`,
            label: transaction.description,
            description: 'Search by description'
          });
        }
      });

      // Reference number suggestions
      transactions.forEach(transaction => {
        if (transaction.reference_number?.toLowerCase().includes(lowerQuery)) {
          searchSuggestionsList.push({
            id: `reference-${transaction.transaction_id}`,
            type: 'reference',
            value: `reference:${transaction.reference_number}`,
            label: `Ref: ${transaction.reference_number}`,
            description: 'Search by reference number'
          });
        }
      });

      // Pattern suggestions
      const uniquePatterns = new Set<string>();
      transactions.forEach(transaction => {
        if (transaction.pattern?.toLowerCase().includes(lowerQuery) && !uniquePatterns.has(transaction.pattern)) {
          uniquePatterns.add(transaction.pattern);
          searchSuggestionsList.push({
            id: `pattern-${transaction.pattern}`,
            type: 'pattern',
            value: `pattern:${transaction.pattern}`,
            label: `Pattern: ${transaction.pattern}`,
            description: 'Search by pattern'
          });
        }
      });

      // GL Account suggestions from CashClearingSuggestion array
      const uniqueGLAccounts = new Set<string>();
      // Now we can safely reference the outer 'suggestions' prop
      suggestions.forEach((clearingSuggestion) => {
        if (clearingSuggestion.gl_account_code?.toLowerCase().includes(lowerQuery) && !uniqueGLAccounts.has(clearingSuggestion.gl_account_code)) {
          uniqueGLAccounts.add(clearingSuggestion.gl_account_code);
          searchSuggestionsList.push({
            id: `gl-${clearingSuggestion.gl_account_code}`,
            type: 'gl_account',
            value: `gl_account:${clearingSuggestion.gl_account_code}`,
            label: `GL: ${clearingSuggestion.gl_account_code}`,
            description: clearingSuggestion.gl_account_name || 'Search by GL account'
          });
        }
      });
    }

    return searchSuggestionsList.slice(0, maxSuggestions);
  }, [query, transactions, suggestions, enableAutocomplete, maxSuggestions]);

  // Parse search query into tokens
  const parseSearchQuery = useCallback((query: string): SearchToken[] => {
    if (!enableSmartSearch) {
      return [{ type: 'text', value: query }];
    }

    const tokens: SearchToken[] = [];
    const parts = query.split(/\s+/);

    parts.forEach(part => {
      if (part.includes(':')) {
        const [field, ...valueParts] = part.split(':');
        if (SEARCH_FIELDS.includes(field.toLowerCase())) {
          tokens.push({ type: 'field', value: field, field });
          tokens.push({ type: 'operator', value: ':', operator: ':' });
          if (valueParts.length > 0) {
            tokens.push({ type: 'value', value: valueParts.join(':') });
          }
        } else {
          tokens.push({ type: 'text', value: part });
        }
      } else if (SEARCH_OPERATORS.some(op => part.includes(op))) {
        // Handle operators like >, <, >=, etc.
        const operatorMatch = SEARCH_OPERATORS.find(op => part.includes(op));
        if (operatorMatch) {
          const [field, value] = part.split(operatorMatch);
          if (field) tokens.push({ type: 'field', value: field, field });
          tokens.push({ type: 'operator', value: operatorMatch, operator: operatorMatch });
          if (value) tokens.push({ type: 'value', value });
        } else {
          tokens.push({ type: 'text', value: part });
        }
      } else {
        tokens.push({ type: 'text', value: part });
      }
    });

    return tokens;
  }, [enableSmartSearch]);

  // Extract field from current query context
  const extractFieldFromQuery = useCallback((query: string): string | null => {
    const tokens = parseSearchQuery(query);
    const fieldToken = tokens.reverse().find(t => t.type === 'field');
    return fieldToken?.field || null;
  }, [parseSearchQuery]);

  // Get field-specific value suggestions
  const getFieldValueSuggestions = useCallback((field: string, query: string): SearchSuggestion[] => {
    const mappedField = FIELD_MAPPINGS[field.toLowerCase()] || field;
    const suggestions: SearchSuggestion[] = [];

    switch (mappedField) {
      case 'approval_status':
        ['PENDING', 'APPROVED', 'REJECTED', 'AUTO_APPROVED'].forEach(status => {
          if (status.toLowerCase().includes(query)) {
            suggestions.push({
              id: `status-${status}`,
              type: 'pattern',
              value: status,
              label: status,
              description: `Filter by ${status} status`
            });
          }
        });
        break;

      case 'currency_code':
        const currencies = [...new Set(transactions.map(t => t.currency_code))];
        currencies.forEach(currency => {
          if (currency?.toLowerCase().includes(query)) {
            suggestions.push({
              id: `currency-${currency}`,
              type: 'pattern',
              value: currency,
              label: currency,
              description: `Filter by ${currency} currency`
            });
          }
        });
        break;

      case 'pattern':
        const patterns = [...new Set(transactions.map(t => t.pattern))];
        patterns.forEach(pattern => {
          if (pattern?.toLowerCase().includes(query)) {
            suggestions.push({
              id: `pattern-${pattern}`,
              type: 'pattern',
              value: pattern,
              label: pattern,
              description: `Filter by ${pattern} pattern`
            });
          }
        });
        break;

      case 'account_id':
        const accounts = [...new Set(transactions.map(t => t.account_id))];
        accounts.forEach(account => {
          if (account?.toLowerCase().includes(query)) {
            suggestions.push({
              id: `account-${account}`,
              type: 'account',
              value: account,
              label: account,
              description: `Filter by account ${account}`
            });
          }
        });
        break;

      default:
        // For text fields, suggest based on actual values
        const values = transactions.map(t => t[mappedField as keyof CashTransaction])
          .filter(v => v && typeof v === 'string')
          .filter(v => v && (v as string).toLowerCase().includes(query));

        [...new Set(values)].slice(0, 5).forEach((value, index) => {
          suggestions.push({
            id: `${field}-value-${index}`,
            type: 'pattern',
            value: value as string,
            label: value as string,
            description: `Filter by ${field}`
          });
        });
        break;
    }

    return suggestions;
  }, [transactions]);

  // Handle search with debouncing
  const handleSearch = useCallback((searchQuery: string) => {
    setIsSearching(true);
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      onSearch(searchQuery, searchSuggestions);
      setIsSearching(false);

      // Add to search history
      if (searchQuery.trim() && onSearchHistoryChange && !searchHistory.includes(searchQuery)) {
        const newHistory = [searchQuery, ...searchHistory].slice(0, 10);
        onSearchHistoryChange(newHistory);
      }
    }, searchDelay);
  }, [onSearch, searchSuggestions, searchDelay, searchHistory, onSearchHistoryChange]);

  // Handle input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setSelectedSuggestionIndex(-1);
    setShowSuggestions(enableAutocomplete && value.length > 0);
    
    if (value.trim()) {
      handleSearch(value);
    }
  }, [handleSearch, enableAutocomplete]);

  // Handle suggestion selection
  const handleSuggestionSelect = useCallback((suggestion: SearchSuggestion) => {
    setQuery(suggestion.value);
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
    onSuggestionSelect?.(suggestion);
    handleSearch(suggestion.value);
    inputRef.current?.focus();
  }, [onSuggestionSelect, handleSearch]);

  // Handle history selection
  const handleHistorySelect = useCallback((historyItem: string) => {
    setQuery(historyItem);
    setShowHistory(false);
    handleSearch(historyItem);
    inputRef.current?.focus();
  }, [handleSearch]);

  // Keyboard navigation for suggestions
  const keyboardNavigation = useKeyboardNavigation({
    enabled: showSuggestions || showHistory,
    onArrowUp: () => {
      const maxIndex = showHistory ? searchHistory.length - 1 : searchSuggestions.length - 1;
      setSelectedSuggestionIndex(prev => prev <= 0 ? maxIndex : prev - 1);
    },
    onArrowDown: () => {
      const maxIndex = showHistory ? searchHistory.length - 1 : searchSuggestions.length - 1;
      setSelectedSuggestionIndex(prev => prev >= maxIndex ? 0 : prev + 1);
    },
    onEnter: () => {
      if (showHistory && selectedSuggestionIndex >= 0) {
        handleHistorySelect(searchHistory[selectedSuggestionIndex]);
      } else if (showSuggestions && selectedSuggestionIndex >= 0) {
        handleSuggestionSelect(searchSuggestions[selectedSuggestionIndex]);
      } else {
        setShowSuggestions(false);
        setShowHistory(false);
        handleSearch(query);
      }
    },
    onEscape: () => {
      setShowSuggestions(false);
      setShowHistory(false);
      setSelectedSuggestionIndex(-1);
    }
  });

  // Handle input focus/blur
  const handleInputFocus = useCallback(() => {
    if (query.length > 0) {
      setShowSuggestions(enableAutocomplete);
    } else if (showSearchHistory && searchHistory.length > 0) {
      setShowHistory(true);
    }
  }, [query, enableAutocomplete, showSearchHistory, searchHistory]);

  const handleInputBlur = useCallback(() => {
    // Delay hiding suggestions to allow for clicks
    setTimeout(() => {
      setShowSuggestions(false);
      setShowHistory(false);
      setSelectedSuggestionIndex(-1);
    }, 200);
  }, []);

  // Attach keyboard navigation
  useEffect(() => {
    if (inputRef.current) {
      keyboardNavigation.attachToElement(inputRef.current);
    }
  }, [keyboardNavigation]);

  // Clear search
  const handleClear = useCallback(() => {
    setQuery('');
    setShowSuggestions(false);
    setShowHistory(false);
    setSelectedSuggestionIndex(-1);
    onSearch('');
    inputRef.current?.focus();
  }, [onSearch]);

  return (
    <div className={`relative ${className}`}>
      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          {isSearching ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
          ) : (
            <svg className="h-4 w-4 text-gray-400 dark:text-gray-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          )}
        </div>
        
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          disabled={disabled}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        
        {query && (
          <button
            onClick={handleClear}
            className="absolute inset-y-0 right-0 pr-3 flex items-center"
          >
            <svg className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>

      {/* Search Suggestions */}
      {(showSuggestions || showHistory) && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-80 overflow-y-auto"
        >
          {showHistory && searchHistory.length > 0 && (
            <div className="p-2 border-b border-gray-200 dark:border-gray-700">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Recent Searches</div>
              {searchHistory.map((item, index) => (
                <button
                  key={`history-${index}`}
                  onClick={() => handleHistorySelect(item)}
                  className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
                    selectedSuggestionIndex === index ? 'bg-blue-100 dark:bg-blue-900/30' : ''
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <svg className="h-3 w-3 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-900 dark:text-gray-100">{item}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {showSuggestions && searchSuggestions.length > 0 && (
            <div className="p-2">
              {searchSuggestions.map((suggestion, index) => (
                <button
                  key={suggestion.id}
                  onClick={() => handleSuggestionSelect(suggestion)}
                  className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
                    selectedSuggestionIndex === index ? 'bg-blue-100 dark:bg-blue-900/30' : ''
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${
                      suggestion.type === 'transaction' ? 'bg-blue-500' :
                      suggestion.type === 'description' ? 'bg-green-500' :
                      suggestion.type === 'reference' ? 'bg-yellow-500' :
                      suggestion.type === 'pattern' ? 'bg-purple-500' :
                      suggestion.type === 'gl_account' ? 'bg-red-500' :
                      'bg-gray-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-gray-900 dark:text-gray-100 truncate">
                        {suggestion.label}
                      </div>
                      {suggestion.description && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {suggestion.description}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {showSuggestions && searchSuggestions.length === 0 && query.length > 0 && (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">
              <div className="text-sm">No suggestions found</div>
              <div className="text-xs mt-1">Press Enter to search</div>
            </div>
          )}
        </div>
      )}

      {/* Search Help */}
      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        <details className="group">
          <summary className="cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
            Search syntax help
          </summary>
          <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-900 rounded text-xs space-y-1">
            <div><strong>Field search:</strong> field:value (e.g., amount:1000, status:pending)</div>
            <div><strong>Operators:</strong> &gt;, &lt;, &gt;=, &lt;=, != (e.g., amount&gt;1000)</div>
            <div><strong>Text search:</strong> contains, starts, ends (e.g., description contains "payment")</div>
            <div><strong>Fields:</strong> id, description, amount, date, account, currency, pattern, gl_account, confidence, status, batch, reference</div>
          </div>
        </details>
      </div>
    </div>
  );
}