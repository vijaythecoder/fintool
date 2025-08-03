'use client';

import React, { useMemo } from 'react';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { ConfidenceBadge } from './ConfidenceIndicator';
import type { CashTransaction, CashClearingSuggestion, WorkflowState, AuditLogEntry } from '../../lib/types';

export interface TimelineEvent {
  id: string;
  type: 'transaction_created' | 'pattern_matched' | 'gl_mapped' | 'approval_pending' | 'approved' | 'rejected' | 'auto_approved' | 'workflow_step' | 'error' | 'manual_action';
  title: string;
  description?: string;
  timestamp: string;
  status: 'completed' | 'pending' | 'failed' | 'in_progress';
  metadata?: Record<string, any>;
  actor?: string;
  confidence?: number;
  details?: {
    before?: any;
    after?: any;
    changes?: Record<string, any>;
  };
}

export interface TransactionTimelineProps {
  transaction: CashTransaction;
  suggestion?: CashClearingSuggestion;
  workflowState?: WorkflowState;
  auditLogs?: AuditLogEntry[];
  showDetails?: boolean;
  showConfidence?: boolean;
  showActor?: boolean;
  maxEvents?: number;
  className?: string;
  timeFormat?: 'relative' | 'absolute' | 'both';
  groupByDay?: boolean;
  enableFiltering?: boolean;
}

export function TransactionTimeline({
  transaction,
  suggestion,
  workflowState,
  auditLogs = [],
  showDetails = true,
  showConfidence = true,
  showActor = true,
  maxEvents,
  className = '',
  timeFormat = 'both',
  groupByDay = true,
  enableFiltering = false
}: TransactionTimelineProps) {
  const [eventFilter, setEventFilter] = React.useState<string>('all');
  const [expandedEvents, setExpandedEvents] = React.useState<Set<string>>(new Set());

  // Generate timeline events from transaction data
  const timelineEvents = useMemo((): TimelineEvent[] => {
    const events: TimelineEvent[] = [];

    // Transaction creation event
    events.push({
      id: `transaction-created-${transaction.transaction_id}`,
      type: 'transaction_created',
      title: 'Transaction Created',
      description: `${transaction.description} - ${new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: transaction.currency_code || 'USD'
      }).format(transaction.amount)}`,
      timestamp: transaction.created_at || transaction.transaction_date,
      status: 'completed',
      metadata: {
        amount: transaction.amount,
        currency: transaction.currency_code,
        account: transaction.account_id,
        source: transaction.source_system
      }
    });

    // Pattern matching event
    if (transaction.pattern && transaction.pattern !== 'T_NOTFOUND') {
      events.push({
        id: `pattern-matched-${transaction.transaction_id}`,
        type: 'pattern_matched',
        title: 'Pattern Matched',
        description: `Matched pattern: ${transaction.pattern}`,
        timestamp: transaction.updated_at || transaction.created_at || transaction.transaction_date,
        status: 'completed',
        metadata: {
          pattern: transaction.pattern
        }
      });
    }

    // AI suggestion events
    if (suggestion) {
      events.push({
        id: `ai-suggestion-${suggestion.suggestion_id}`,
        type: 'gl_mapped',
        title: 'AI Suggestion Generated',
        description: suggestion.gl_account_code 
          ? `Suggested GL Account: ${suggestion.gl_account_code} (${suggestion.debit_credit_indicator})`
          : 'AI analysis completed',
        timestamp: suggestion.approved_at || transaction.updated_at || transaction.transaction_date,
        status: 'completed',
        confidence: suggestion.confidence_score,
        metadata: {
          gl_account: suggestion.gl_account_code,
          gl_name: suggestion.gl_account_name,
          debit_credit: suggestion.debit_credit_indicator,
          ai_model: suggestion.ai_model,
          processing_time: suggestion.processing_time_ms
        },
        details: {
          after: {
            reasoning: suggestion.reasoning,
            validation_checks: suggestion.validation_checks
          }
        }
      });

      // Approval workflow events
      switch (suggestion.approval_status) {
        case 'PENDING':
          events.push({
            id: `approval-pending-${suggestion.suggestion_id}`,
            type: 'approval_pending',
            title: 'Approval Required',
            description: 'Waiting for human approval',
            timestamp: suggestion.approved_at || transaction.updated_at || transaction.transaction_date,
            status: 'pending',
            confidence: suggestion.confidence_score
          });
          break;

        case 'APPROVED':
          events.push({
            id: `approved-${suggestion.suggestion_id}`,
            type: 'approved',
            title: 'Approved',
            description: 'Suggestion approved by human reviewer',
            timestamp: suggestion.approved_at || transaction.transaction_date,
            status: 'completed',
            actor: suggestion.approved_by,
            confidence: suggestion.confidence_score
          });
          break;

        case 'REJECTED':
          events.push({
            id: `rejected-${suggestion.suggestion_id}`,
            type: 'rejected',
            title: 'Rejected',
            description: 'Suggestion rejected by human reviewer',
            timestamp: suggestion.approved_at || transaction.transaction_date,
            status: 'failed',
            actor: suggestion.approved_by,
            confidence: suggestion.confidence_score
          });
          break;

        case 'AUTO_APPROVED':
          events.push({
            id: `auto-approved-${suggestion.suggestion_id}`,
            type: 'auto_approved',
            title: 'Auto-Approved',
            description: 'Automatically approved due to high confidence',
            timestamp: suggestion.approved_at || transaction.transaction_date,
            status: 'completed',
            confidence: suggestion.confidence_score
          });
          break;
      }
    }

    // Workflow step events
    if (workflowState) {
      const steps = [
        { step: 1, name: 'Pattern Analysis', completed_at: workflowState.step_1_completed_at },
        { step: 2, name: 'AI Processing', completed_at: workflowState.step_2_completed_at },
        { step: 3, name: 'Validation', completed_at: workflowState.step_3_completed_at },
        { step: 4, name: 'Final Processing', completed_at: workflowState.step_4_completed_at }
      ];

      steps.forEach(({ step, name, completed_at }) => {
        if (completed_at) {
          events.push({
            id: `workflow-step-${step}-${workflowState.batch_id}`,
            type: 'workflow_step',
            title: `Step ${step}: ${name}`,
            description: `Workflow step ${step} completed`,
            timestamp: completed_at,
            status: 'completed',
            metadata: {
              step,
              batch_id: workflowState.batch_id,
              workflow_status: workflowState.workflow_status
            }
          });
        } else if (workflowState.current_step === step) {
          events.push({
            id: `workflow-step-${step}-pending-${workflowState.batch_id}`,
            type: 'workflow_step',
            title: `Step ${step}: ${name}`,
            description: `Currently processing step ${step}`,
            timestamp: new Date().toISOString(),
            status: 'in_progress',
            metadata: {
              step,
              batch_id: workflowState.batch_id,
              workflow_status: workflowState.workflow_status
            }
          });
        }
      });
    }

    // Audit log events
    auditLogs.forEach(log => {
      const eventType = log.action_type.toLowerCase() as any;
      events.push({
        id: `audit-${log.audit_id || log.timestamp}`,
        type: eventType,
        title: getAuditActionTitle(log.action_type),
        description: getAuditActionDescription(log),
        timestamp: log.timestamp || new Date().toISOString(),
        status: log.error_details ? 'failed' : 'completed',
        actor: log.user_id,
        confidence: log.confidence_score,
        metadata: {
          step: log.step_number,
          processing_time: log.processing_time_ms,
          ai_model: log.ai_model
        },
        details: {
          before: log.input_data,
          after: log.output_data,
          changes: log.action_details
        }
      });
    });

    // Sort events by timestamp
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Apply filtering
    const filteredEvents = eventFilter === 'all' 
      ? events 
      : events.filter(event => event.type === eventFilter);

    // Apply max events limit
    return maxEvents ? filteredEvents.slice(-maxEvents) : filteredEvents;
  }, [transaction, suggestion, workflowState, auditLogs, eventFilter, maxEvents]);

  // Group events by day if enabled
  const groupedEvents = useMemo(() => {
    if (!groupByDay) return { 'All Events': timelineEvents };

    const groups: Record<string, TimelineEvent[]> = {};
    
    timelineEvents.forEach(event => {
      const date = format(parseISO(event.timestamp), 'yyyy-MM-dd');
      const label = format(parseISO(event.timestamp), 'MMMM d, yyyy');
      
      if (!groups[label]) {
        groups[label] = [];
      }
      groups[label].push(event);
    });

    return groups;
  }, [timelineEvents, groupByDay]);

  // Toggle event expansion
  const toggleEventExpansion = (eventId: string) => {
    setExpandedEvents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(eventId)) {
        newSet.delete(eventId);
      } else {
        newSet.add(eventId);
      }
      return newSet;
    });
  };

  // Get event icon
  const getEventIcon = (event: TimelineEvent) => {
    const iconClass = `w-5 h-5 ${
      event.status === 'completed' ? 'text-green-600 dark:text-green-400' :
      event.status === 'failed' ? 'text-red-600 dark:text-red-400' :
      event.status === 'in_progress' ? 'text-blue-600 dark:text-blue-400' :
      'text-yellow-600 dark:text-yellow-400'
    }`;

    switch (event.type) {
      case 'transaction_created':
        return (
          <svg className={iconClass} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      case 'pattern_matched':
        return (
          <svg className={iconClass} viewBox="0 0 20 20" fill="currentColor">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        );
      case 'gl_mapped':
        return (
          <svg className={iconClass} viewBox="0 0 20 20" fill="currentColor">
            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
            <path fillRule="evenodd" d="M4 5a2 2 0 012-2v1a1 1 0 001 1h6a1 1 0 001-1V3a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
          </svg>
        );
      case 'approved':
        return (
          <svg className={iconClass} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        );
      case 'rejected':
        return (
          <svg className={iconClass} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        );
      case 'approval_pending':
        return (
          <svg className={iconClass} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
          </svg>
        );
      default:
        return (
          <svg className={iconClass} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  // Format timestamp
  const formatTimestamp = (timestamp: string) => {
    const date = parseISO(timestamp);
    
    switch (timeFormat) {
      case 'relative':
        return formatDistanceToNow(date, { addSuffix: true });
      case 'absolute':
        return format(date, 'MMM d, yyyy h:mm a');
      case 'both':
        return `${format(date, 'MMM d, yyyy h:mm a')} (${formatDistanceToNow(date, { addSuffix: true })})`;
      default:
        return format(date, 'MMM d, yyyy h:mm a');
    }
  };

  if (timelineEvents.length === 0) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 text-center ${className}`}>
        <div className="text-gray-500 dark:text-gray-400">
          <svg className="w-8 h-8 mx-auto mb-2" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
          </svg>
          <p>No timeline events available</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Transaction Timeline
          </h3>
          
          {enableFiltering && (
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              <option value="all">All Events</option>
              <option value="transaction_created">Transaction Created</option>
              <option value="pattern_matched">Pattern Matched</option>
              <option value="gl_mapped">AI Suggestions</option>
              <option value="approved">Approvals</option>
              <option value="workflow_step">Workflow Steps</option>
            </select>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="px-6 py-4">
        {Object.entries(groupedEvents).map(([groupLabel, events]) => (
          <div key={groupLabel} className="mb-6 last:mb-0">
            {groupByDay && Object.keys(groupedEvents).length > 1 && (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">{groupLabel}</h4>
              </div>
            )}
            
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700"></div>
              
              {events.map((event, index) => {
                const isExpanded = expandedEvents.has(event.id);
                const hasDetails = showDetails && (event.details || event.metadata);
                
                return (
                  <div key={event.id} className="relative flex items-start mb-6 last:mb-0">
                    {/* Timeline dot */}
                    <div className={`relative z-10 flex items-center justify-center w-12 h-12 rounded-full border-2 ${
                      event.status === 'completed' ? 'bg-green-100 border-green-500 dark:bg-green-900/30 dark:border-green-400' :
                      event.status === 'failed' ? 'bg-red-100 border-red-500 dark:bg-red-900/30 dark:border-red-400' :
                      event.status === 'in_progress' ? 'bg-blue-100 border-blue-500 dark:bg-blue-900/30 dark:border-blue-400' :
                      'bg-yellow-100 border-yellow-500 dark:bg-yellow-900/30 dark:border-yellow-400'
                    }`}>
                      {getEventIcon(event)}
                    </div>
                    
                    {/* Event content */}
                    <div className="ml-4 flex-1 min-w-0">
                      <div 
                        className={`bg-gray-50 dark:bg-gray-900 rounded-lg p-4 ${hasDetails ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800' : ''}`}
                        onClick={hasDetails ? () => toggleEventExpansion(event.id) : undefined}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {event.title}
                              </h4>
                              {showConfidence && event.confidence !== undefined && (
                                <ConfidenceBadge confidence={event.confidence} size="sm" />
                              )}
                              {hasDetails && (
                                <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                            
                            {event.description && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                {event.description}
                              </p>
                            )}
                            
                            <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                              <span>{formatTimestamp(event.timestamp)}</span>
                              {showActor && event.actor && (
                                <span>by {event.actor}</span>
                              )}
                              {event.metadata?.processing_time && (
                                <span>{event.metadata.processing_time}ms</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Expanded details */}
                        {isExpanded && hasDetails && (
                          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                            {event.metadata && (
                              <div className="mb-3">
                                <h5 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Metadata</h5>
                                <div className="bg-gray-100 dark:bg-gray-800 rounded p-2 text-xs font-mono">
                                  <pre className="whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                                    {JSON.stringify(event.metadata, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            )}
                            
                            {event.details && (
                              <div className="space-y-3">
                                {event.details.before && (
                                  <div>
                                    <h5 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Before</h5>
                                    <div className="bg-gray-100 dark:bg-gray-800 rounded p-2 text-xs font-mono max-h-32 overflow-y-auto">
                                      <pre className="whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                                        {JSON.stringify(event.details.before, null, 2)}
                                      </pre>
                                    </div>
                                  </div>
                                )}
                                
                                {event.details.after && (
                                  <div>
                                    <h5 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">After</h5>
                                    <div className="bg-gray-100 dark:bg-gray-800 rounded p-2 text-xs font-mono max-h-32 overflow-y-auto">
                                      <pre className="whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                                        {JSON.stringify(event.details.after, null, 2)}
                                      </pre>
                                    </div>
                                  </div>
                                )}
                                
                                {event.details.changes && (
                                  <div>
                                    <h5 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Changes</h5>
                                    <div className="bg-gray-100 dark:bg-gray-800 rounded p-2 text-xs font-mono max-h-32 overflow-y-auto">
                                      <pre className="whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                                        {JSON.stringify(event.details.changes, null, 2)}
                                      </pre>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Helper functions
function getAuditActionTitle(actionType: string): string {
  switch (actionType) {
    case 'QUERY': return 'Data Query';
    case 'MATCH': return 'Pattern Match';
    case 'APPROVE': return 'Manual Approval';
    case 'REJECT': return 'Manual Rejection';
    case 'AUTO_PROCESS': return 'Auto Processing';
    default: return actionType.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  }
}

function getAuditActionDescription(log: AuditLogEntry): string {
  if (log.error_details) {
    return `Failed: ${Object.values(log.error_details)[0] || 'Unknown error'}`;
  }
  
  switch (log.action_type) {
    case 'QUERY':
      return 'Database query executed';
    case 'MATCH':
      return `Pattern matching completed${log.confidence_score ? ` with ${Math.round(log.confidence_score * 100)}% confidence` : ''}`;
    case 'APPROVE':
      return 'Transaction approved by human reviewer';
    case 'REJECT':
      return 'Transaction rejected by human reviewer';
    case 'AUTO_PROCESS':
      return 'Automatically processed due to high confidence';
    default:
      return `${(log.action_type as string).replace('_', ' ').toLowerCase()} completed`;
  }
}