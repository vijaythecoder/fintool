# Cash Clearing Workflow Components

A comprehensive set of React components for managing human approval workflows in the AI-enhanced cash clearing system. These components provide a modern, accessible, and responsive interface for reviewing and approving AI-generated transaction suggestions.

## Components Overview

### 🏠 CashClearingDashboard
The main dashboard component that orchestrates the entire workflow.

**Features:**
- Workflow progress visualization
- Real-time metrics and KPIs
- Tabbed interface for different review types
- Auto-refresh functionality
- Workflow control (start/pause/resume)

**Props:**
```typescript
interface CashClearingDashboardProps {
  workflowState?: WorkflowState;
  transactions: CashTransaction[];
  suggestions: CashClearingSuggestion[];
  patterns?: ProcessorPattern[];
  glMappings?: GLPattern[];
  executionResult?: WorkflowExecutionResult;
  onRefresh?: () => Promise<void>;
  onApproveTransaction?: (suggestionId: string, reason?: string) => Promise<void>;
  onRejectTransaction?: (suggestionId: string, reason: string) => Promise<void>;
  onBatchApprove?: (suggestionIds: string[]) => Promise<void>;
  onBatchReject?: (suggestionIds: string[], reason: string) => Promise<void>;
  // ... more handlers
}
```

### 📋 TransactionApprovalQueue
Displays transactions pending human approval with filtering and batch operations.

**Features:**
- Sortable and filterable transaction list
- Batch approval/rejection
- Individual transaction actions
- Real-time status updates
- Detailed transaction modal

### 🔍 PatternMatchingReview
Reviews AI-identified patterns and their transaction matches.

**Features:**
- Pattern confidence scoring
- Match type visualization
- Expandable pattern details
- Individual match approval
- Pattern validation controls

### 💰 GLAccountMappingReview
Reviews GL account mappings and their business impact.

**Features:**
- Account category filtering
- Business impact metrics
- Confidence-based sorting
- Validation issue highlighting
- Bulk mapping approval

### 📊 ApprovalWorkflowStep
Reusable component for displaying workflow step status.

**Features:**
- Progress visualization
- Status indicators
- Collapsible content
- Action buttons
- Processing metrics

### 🎯 ConfidenceIndicator
Visual component for displaying AI confidence scores.

**Features:**
- Multiple size variants
- Color-coded confidence levels
- Progress bar and badge styles
- Customizable thresholds
- Accessibility compliant

### 📝 TransactionDetailsModal
Detailed modal view for individual transactions.

**Features:**
- Complete transaction information
- AI suggestion details
- Pattern matching info
- GL mapping visualization
- Approval/rejection forms

## Usage Examples

### Basic Dashboard Implementation

```tsx
import React, { useState, useEffect } from 'react';
import { CashClearingDashboard } from './components/cash-clearing';
import type { CashTransaction, CashClearingSuggestion } from './lib/types';

export function MyWorkflowPage() {
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [suggestions, setSuggestions] = useState<CashClearingSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleApproveTransaction = async (suggestionId: string, reason?: string) => {
    // Implement approval logic
    await fetch('/api/approve', {
      method: 'POST',
      body: JSON.stringify({ suggestionId, reason })
    });
    // Refresh data
    await refreshData();
  };

  const handleRejectTransaction = async (suggestionId: string, reason: string) => {
    // Implement rejection logic
    await fetch('/api/reject', {
      method: 'POST',
      body: JSON.stringify({ suggestionId, reason })
    });
    // Refresh data
    await refreshData();
  };

  const refreshData = async () => {
    setIsLoading(true);
    try {
      // Fetch data from BigQuery MCP
      const response = await fetch('/api/workflow-data');
      const data = await response.json();
      setTransactions(data.transactions);
      setSuggestions(data.suggestions);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <CashClearingDashboard
      transactions={transactions}
      suggestions={suggestions}
      onApproveTransaction={handleApproveTransaction}
      onRejectTransaction={handleRejectTransaction}
      onRefresh={refreshData}
      isLoading={isLoading}
    />
  );
}
```

### Standalone Components

```tsx
import { TransactionApprovalQueue, ConfidenceIndicator } from './components/cash-clearing';

// Use individual components
export function ApprovalPage() {
  return (
    <div>
      <h1>Transaction Approvals</h1>
      <TransactionApprovalQueue
        transactions={transactions}
        suggestions={suggestions}
        onApprove={handleApprove}
        onReject={handleReject}
      />
    </div>
  );
}

// Display confidence scores
export function ConfidenceDisplay({ score }: { score: number }) {
  return (
    <ConfidenceIndicator
      confidence={score}
      size="lg"
      showPercentage={true}
      showLabel={true}
    />
  );
}
```

## Integration with BigQuery MCP

The components are designed to work seamlessly with BigQuery MCP for data operations:

```typescript
// Example MCP integration
import { MCPClient } from '../lib/mcp-client';

class WorkflowService {
  private mcpClient = new MCPClient();

  async getTransactions(batchId: string): Promise<CashTransaction[]> {
    const result = await this.mcpClient.query(`
      SELECT 
        transaction_id,
        amount,
        description,
        transaction_date,
        account_id,
        currency_code,
        pattern,
        source_system
      FROM cash_clearing.transactions 
      WHERE batch_id = '${batchId}'
    `);
    return result.data;
  }

  async getSuggestions(batchId: string): Promise<CashClearingSuggestion[]> {
    const result = await this.mcpClient.query(`
      SELECT 
        suggestion_id,
        transaction_id,
        workflow_step,
        pattern_matched,
        gl_account_code,
        gl_account_name,
        debit_credit_indicator,
        amount,
        confidence_score,
        approval_status,
        reasoning
      FROM cash_clearing.suggestions 
      WHERE processing_batch_id = '${batchId}'
    `);
    return result.data;
  }

  async approveTransaction(suggestionId: string, reason?: string): Promise<void> {
    await this.mcpClient.query(`
      UPDATE cash_clearing.suggestions 
      SET 
        approval_status = 'APPROVED',
        approved_by = CURRENT_USER(),
        approved_at = CURRENT_TIMESTAMP()
      WHERE suggestion_id = '${suggestionId}'
    `);
  }
}
```

## Styling and Theming

The components use Tailwind CSS with dark mode support:

```css
/* Add custom styles if needed */
.cash-clearing-dashboard {
  @apply bg-white dark:bg-gray-800;
}

.confidence-high {
  @apply text-green-600 dark:text-green-400;
}

.confidence-medium {
  @apply text-yellow-600 dark:text-yellow-400;
}

.confidence-low {
  @apply text-red-600 dark:text-red-400;
}
```

## Accessibility Features

All components include comprehensive accessibility features:

- **Keyboard Navigation**: Full keyboard support with proper tab order
- **Screen Reader Support**: ARIA labels and semantic HTML
- **Focus Management**: Visible focus indicators and logical flow
- **Color Contrast**: WCAG 2.1 AA compliant color combinations
- **Responsive Design**: Works on all device sizes

## Real-time Updates

Components support real-time updates through various mechanisms:

```typescript
// WebSocket integration
const useRealTimeUpdates = (workflowId: string) => {
  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:3001/workflow/${workflowId}`);
    
    ws.onmessage = (event) => {
      const update = JSON.parse(event.data);
      // Update component state based on message type
      switch (update.type) {
        case 'SUGGESTION_APPROVED':
          updateSuggestion(update.suggestionId, 'APPROVED');
          break;
        case 'WORKFLOW_STEP_COMPLETE':
          updateWorkflowStep(update.step);
          break;
      }
    };

    return () => ws.close();
  }, [workflowId]);
};

// Polling integration
const usePollingUpdates = (interval: number = 30000) => {
  useEffect(() => {
    const timer = setInterval(async () => {
      await refreshData();
    }, interval);

    return () => clearInterval(timer);
  }, [interval]);
};
```

## Error Handling

Components include comprehensive error handling:

```typescript
// Error boundary for components
export function CashClearingErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center">
          <h2 className="text-lg font-semibold text-red-600">Something went wrong</h2>
          <p className="text-gray-600 mt-2">Please refresh the page and try again.</p>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}

// Usage with error handling
export function ProtectedWorkflow() {
  return (
    <CashClearingErrorBoundary>
      <CashClearingDashboard {...props} />
    </CashClearingErrorBoundary>
  );
}
```

## Performance Optimization

The components are optimized for performance:

- **React.memo**: Components are memoized to prevent unnecessary re-renders
- **Virtualization**: Large lists support virtual scrolling
- **Lazy Loading**: Modal content is loaded on demand
- **Debounced Searches**: Search and filter operations are debounced
- **Optimistic Updates**: UI updates immediately for better UX

## Testing

Components include comprehensive test coverage:

```typescript
// Example test
import { render, screen, fireEvent } from '@testing-library/react';
import { CashClearingDashboard } from './CashClearingDashboard';

describe('CashClearingDashboard', () => {
  it('displays transaction metrics correctly', () => {
    render(
      <CashClearingDashboard
        transactions={mockTransactions}
        suggestions={mockSuggestions}
      />
    );

    expect(screen.getByText('Total Transactions')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('handles approval actions', async () => {
    const onApprove = jest.fn();
    render(
      <CashClearingDashboard
        transactions={mockTransactions}
        suggestions={mockSuggestions}
        onApproveTransaction={onApprove}
      />
    );

    fireEvent.click(screen.getByText('Approve'));
    expect(onApprove).toHaveBeenCalledWith('SUG-001');
  });
});
```

## File Structure

```
components/cash-clearing/
├── index.ts                     # Main exports
├── CashClearingDashboard.tsx    # Main dashboard
├── TransactionApprovalQueue.tsx # Transaction list
├── PatternMatchingReview.tsx    # Pattern review
├── GLAccountMappingReview.tsx   # GL mapping review
├── ApprovalWorkflowStep.tsx     # Workflow step
├── ConfidenceIndicator.tsx      # Confidence display
├── TransactionDetailsModal.tsx  # Detail modal
├── CashClearingExample.tsx      # Usage example
└── README.md                    # Documentation
```

## Next Steps

1. **Integration**: Connect components to your BigQuery MCP endpoints
2. **Authentication**: Add user authentication and role-based access
3. **Real-time**: Implement WebSocket or polling for live updates
4. **Testing**: Add comprehensive test coverage
5. **Monitoring**: Add analytics and error tracking
6. **Documentation**: Create user guides and training materials

For more information or support, please refer to the main project documentation or contact the development team.