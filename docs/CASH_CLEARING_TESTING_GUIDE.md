# Cash Clearing Workflow Testing Guide

## Table of Contents
1. [Testing Overview](#testing-overview)
2. [Test Environment Setup](#test-environment-setup)
3. [Unit Testing](#unit-testing)
4. [Integration Testing](#integration-testing)
5. [End-to-End Testing](#end-to-end-testing)
6. [Performance Testing](#performance-testing)
7. [Security Testing](#security-testing)
8. [Test Data Management](#test-data-management)
9. [CI/CD Integration](#cicd-integration)
10. [Testing Best Practices](#testing-best-practices)

## Testing Overview

The Cash Clearing Workflow system requires comprehensive testing across multiple layers:

- **Unit Tests**: Individual component and function testing
- **Integration Tests**: API and database integration testing
- **E2E Tests**: Complete workflow scenario testing
- **Performance Tests**: Load and stress testing
- **Security Tests**: Vulnerability and penetration testing

### Testing Stack
- **Test Runner**: Jest / Vitest
- **React Testing**: React Testing Library
- **API Testing**: Supertest
- **E2E Testing**: Playwright / Cypress
- **Performance**: K6 / Artillery
- **Mocking**: MSW (Mock Service Worker)

## Test Environment Setup

### 1. Install Dependencies

```bash
# Core testing dependencies
npm install --save-dev jest @testing-library/react @testing-library/jest-dom
npm install --save-dev @testing-library/user-event @testing-library/hooks
npm install --save-dev supertest msw
npm install --save-dev @types/jest ts-jest

# E2E testing
npm install --save-dev playwright @playwright/test

# Performance testing
npm install -g k6
```

### 2. Jest Configuration

```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@components/(.*)$': '<rootDir>/components/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    'components/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
```

### 3. Test Environment Variables

```bash
# .env.test
BIGQUERY_PROJECT_ID=test-project
BIGQUERY_DATASET=test_dataset
OPENAI_API_KEY=test-api-key
NEXT_PUBLIC_API_URL=http://localhost:3000
```

## Unit Testing

### Component Testing Examples

#### 1. Testing Transaction Table Component

```typescript
// __tests__/components/TransactionTable.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransactionTable } from '@/components/cash-clearing/TransactionTable';

describe('TransactionTable', () => {
  const mockTransactions = [
    {
      bt_id: 'TXN001',
      transaction_id: 'TXN001',
      amount: 1500.50,
      text: 'SETTLEMENT payment from account 12345',
      pattern: 'T_NOTFOUND',
      transaction_date: '2024-01-15',
      customer_account_number: 'ACC001',
      type_code: 'CREDIT'
    }
  ];

  const mockSuggestions = [
    {
      suggestion_id: 'SUG001',
      bt_id: 'TXN001',
      transaction_id: 'TXN001',
      AI_SUGGEST_TEXT: 'SETTLEMENT',
      AI_CONFIDENCE_SCORE: 0.92,
      AI_GL_ACCOUNT: '1200',
      approval_status: 'PENDING'
    }
  ];

  it('renders transactions with suggestions correctly', () => {
    render(
      <TransactionTable
        transactions={mockTransactions}
        suggestions={mockSuggestions}
      />
    );

    expect(screen.getByText('SETTLEMENT payment from account 12345')).toBeInTheDocument();
    expect(screen.getByText('92%')).toBeInTheDocument(); // Confidence score
    expect(screen.getByText('1200')).toBeInTheDocument(); // GL Account
  });

  it('handles row selection correctly', async () => {
    const onSelectionChange = jest.fn();
    const user = userEvent.setup();

    render(
      <TransactionTable
        transactions={mockTransactions}
        suggestions={mockSuggestions}
        enableRowSelection
        onSelectionChange={onSelectionChange}
      />
    );

    const checkbox = screen.getByRole('checkbox', { name: /select transaction/i });
    await user.click(checkbox);

    expect(onSelectionChange).toHaveBeenCalledWith(['TXN001']);
  });

  it('handles sorting correctly', async () => {
    const onSort = jest.fn();
    const user = userEvent.setup();

    render(
      <TransactionTable
        transactions={mockTransactions}
        onSort={onSort}
      />
    );

    const amountHeader = screen.getByText('Amount');
    await user.click(amountHeader);

    expect(onSort).toHaveBeenCalledWith('amount', 'asc');
  });

  it('displays empty state when no transactions', () => {
    render(
      <TransactionTable
        transactions={[]}
        emptyMessage="No transactions found"
      />
    );

    expect(screen.getByText('No transactions found')).toBeInTheDocument();
  });
});
```

#### 2. Testing Confidence Indicator Component

```typescript
// __tests__/components/ConfidenceIndicator.test.tsx
import { render, screen } from '@testing-library/react';
import { ConfidenceIndicator } from '@/components/cash-clearing/ConfidenceIndicator';

describe('ConfidenceIndicator', () => {
  it.each([
    [0.95, 'Very High', 'bg-green-500'],
    [0.85, 'High', 'bg-blue-500'],
    [0.65, 'Medium', 'bg-yellow-500'],
    [0.45, 'Low', 'bg-orange-500'],
    [0.25, 'Very Low', 'bg-red-500'],
  ])('renders correct label and color for confidence %s', (confidence, label, colorClass) => {
    render(<ConfidenceIndicator confidence={confidence} />);
    
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(`${Math.round(confidence * 100)}%`)).toBeInTheDocument();
    
    const element = screen.getByTestId('confidence-bar');
    expect(element).toHaveClass(colorClass);
  });

  it('handles showNumeric prop correctly', () => {
    render(<ConfidenceIndicator confidence={0.75} showNumeric={false} />);
    
    expect(screen.queryByText('75%')).not.toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
  });
});
```

### Service Testing Examples

#### 1. Testing Cash Clearing Processor

```javascript
// __tests__/processors/cashClearingProcessor.test.js
import { CashClearingProcessor } from '@/src/processors/cashClearingProcessor';
import { getCashClearingMcpClient } from '@/src/services/cashClearingMcpClient';
import { generateText } from 'ai';

jest.mock('@/src/services/cashClearingMcpClient');
jest.mock('ai');

describe('CashClearingProcessor', () => {
  let processor;
  let mockMcpClient;

  beforeEach(() => {
    processor = new CashClearingProcessor({
      batchSize: 10,
      approvalThreshold: 0.9,
      requireHumanApproval: true
    });

    mockMcpClient = {
      getUnprocessedTransactions: jest.fn(),
      getActiveProcessorPatterns: jest.fn(),
      getGLPatternsForPattern: jest.fn(),
      insertCashClearingSuggestions: jest.fn(),
      updateWorkflowState: jest.fn(),
      insertAuditLogEntry: jest.fn()
    };

    getCashClearingMcpClient.mockReturnValue(mockMcpClient);
  });

  describe('executeStep1 - Query Transactions', () => {
    it('should query unprocessed transactions successfully', async () => {
      const mockTransactions = [
        { bt_id: 'TXN001', text: 'SETTLEMENT', amount: 1000 },
        { bt_id: 'TXN002', text: 'TOPUP', amount: 500 }
      ];

      mockMcpClient.getUnprocessedTransactions.mockResolvedValue(mockTransactions);

      const result = await processor.executeStep1({}, { batch_id: 'BATCH001' });

      expect(result.completed).toBe(true);
      expect(result.count).toBe(2);
      expect(result.data).toEqual(mockTransactions);
      expect(mockMcpClient.getUnprocessedTransactions).toHaveBeenCalledWith(10, 0);
    });

    it('should handle empty transaction results', async () => {
      mockMcpClient.getUnprocessedTransactions.mockResolvedValue([]);

      const result = await processor.executeStep1({}, { batch_id: 'BATCH001' });

      expect(result.completed).toBe(true);
      expect(result.count).toBe(0);
      expect(result.data).toEqual([]);
    });

    it('should handle query errors', async () => {
      mockMcpClient.getUnprocessedTransactions.mockRejectedValue(
        new Error('BigQuery connection failed')
      );

      await expect(
        processor.executeStep1({}, { batch_id: 'BATCH001' })
      ).rejects.toThrow('Step 1 failed: BigQuery connection failed');
    });
  });

  describe('executeStep2 - Pattern Matching', () => {
    it('should match patterns using AI successfully', async () => {
      const mockTransactions = [
        { bt_id: 'TXN001', text: 'SETTLEMENT from account 123' }
      ];

      const mockPatterns = [
        { pattern_op: 'SETTLEMENT', pattern_search: 'SETTLEMENT', confidence_weight: 0.9 }
      ];

      mockMcpClient.getActiveProcessorPatterns.mockResolvedValue(mockPatterns);

      generateText.mockResolvedValue({
        text: JSON.stringify({
          matches: {
            'TXN001': [{
              pattern_id: 'PAT001',
              pattern_name: 'SETTLEMENT',
              match_strength: 0.95,
              match_details: 'Strong match on SETTLEMENT keyword'
            }]
          },
          confidences: {
            'TXN001': {
              overall_confidence: 0.93,
              pattern_confidence: 0.95
            }
          },
          reasoning: {
            'TXN001': 'Transaction text contains SETTLEMENT keyword with account reference'
          }
        })
      });

      const result = await processor.executeStep2(
        {},
        {},
        mockTransactions,
        { batch_id: 'BATCH001' }
      );

      expect(result.completed).toBe(true);
      expect(result.data[0].matched_patterns).toHaveLength(1);
      expect(result.data[0].matched_patterns[0].pattern_name).toBe('SETTLEMENT');
      expect(result.data[0].confidence_scores.overall_confidence).toBe(0.93);
    });
  });

  describe('Workflow Execution', () => {
    it('should execute complete workflow successfully', async () => {
      // Mock all steps
      mockMcpClient.getUnprocessedTransactions.mockResolvedValue([
        { bt_id: 'TXN001', text: 'SETTLEMENT', amount: 1000 }
      ]);

      mockMcpClient.getActiveProcessorPatterns.mockResolvedValue([
        { pattern_op: 'SETTLEMENT', confidence_weight: 0.9 }
      ]);

      mockMcpClient.getGLPatternsForPattern.mockResolvedValue([
        { GL_ACCOUNT: '1200', FT_ID: 'FT001', gl_account_name: 'Cash Settlement' }
      ]);

      generateText.mockResolvedValue({
        text: JSON.stringify({
          matches: { 'TXN001': [{ pattern_name: 'SETTLEMENT' }] },
          confidences: { 'TXN001': { overall_confidence: 0.95 } },
          gl_account_code: '1200',
          confidence: 0.95
        })
      });

      mockMcpClient.insertCashClearingSuggestions.mockResolvedValue(1);

      const result = await processor.executeCashClearingWorkflow();

      expect(result.workflowId).toBeDefined();
      expect(result.results.summary.totalProcessed).toBe(1);
      expect(mockMcpClient.insertCashClearingSuggestions).toHaveBeenCalled();
    });
  });
});
```

#### 2. Testing MCP Client

```javascript
// __tests__/services/cashClearingMcpClient.test.js
import { CashClearingMcpClient } from '@/src/services/cashClearingMcpClient';
import { getBigQueryTools, executeQuery, insertRows } from '@/src/services/mcpClient';

jest.mock('@/src/services/mcpClient');

describe('CashClearingMcpClient', () => {
  let client;

  beforeEach(() => {
    client = new CashClearingMcpClient({
      dataset: 'test_dataset',
      maxRetries: 3,
      initialRetryDelay: 100
    });

    getBigQueryTools.mockResolvedValue({
      client: { mock: 'client' },
      tools: { mock: 'tools' },
      createdAt: Date.now()
    });
  });

  describe('executeQueryWithRetry', () => {
    it('should execute query successfully on first attempt', async () => {
      const mockResults = [{ id: 1 }, { id: 2 }];
      executeQuery.mockResolvedValue(mockResults);

      const result = await client.executeQueryWithRetry('SELECT * FROM table');

      expect(result).toEqual(mockResults);
      expect(executeQuery).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      executeQuery
        .mockRejectedValueOnce(new Error('RATE_LIMIT_EXCEEDED'))
        .mockRejectedValueOnce(new Error('TIMEOUT'))
        .mockResolvedValueOnce([{ id: 1 }]);

      const result = await client.executeQueryWithRetry('SELECT * FROM table');

      expect(result).toEqual([{ id: 1 }]);
      expect(executeQuery).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable errors', async () => {
      executeQuery.mockRejectedValue(new Error('PERMISSION_DENIED'));

      await expect(
        client.executeQueryWithRetry('SELECT * FROM table')
      ).rejects.toThrow('PERMISSION_DENIED');

      expect(executeQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('Connection Pooling', () => {
    it('should reuse valid connections', async () => {
      await client.getPooledConnection();
      await client.getPooledConnection();

      expect(getBigQueryTools).toHaveBeenCalledTimes(1);
    });

    it('should create new connection when expired', async () => {
      const firstConnection = await client.getPooledConnection();
      
      // Simulate expired connection
      firstConnection.createdAt = Date.now() - 6 * 60 * 1000; // 6 minutes ago
      
      await client.getPooledConnection();

      expect(getBigQueryTools).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cash Clearing Operations', () => {
    it('should insert suggestions with proper transformation', async () => {
      const suggestions = [{
        transaction_id: 'TXN001',
        pattern_matched: 'SETTLEMENT',
        confidence_score: 0.95,
        gl_account_code: '1200',
        amount: 1000,
        reasoning: { pattern: 'SETTLEMENT', confidence: 'high' }
      }];

      insertRows.mockResolvedValue();

      await client.insertCashClearingSuggestions(suggestions);

      expect(insertRows).toHaveBeenCalledWith(
        expect.any(Object),
        'test_dataset.ai_cash_clearing_suggestions',
        expect.arrayContaining([
          expect.objectContaining({
            bt_id: 'TXN001',
            AI_SUGGEST_TEXT: 'SETTLEMENT',
            AI_CONFIDENCE_SCORE: 0.95,
            AI_GL_ACCOUNT: '1200'
          })
        ])
      );
    });
  });
});
```

## Integration Testing

### API Route Testing

```typescript
// __tests__/api/workflow.test.ts
import { createMocks } from 'node-mocks-http';
import { POST as startWorkflow } from '@/app/api/cash-clearing/workflow/start/route';
import { GET as getStatus } from '@/app/api/cash-clearing/workflow/[batchId]/status/route';

describe('/api/cash-clearing/workflow', () => {
  describe('POST /workflow/start', () => {
    it('should start workflow successfully', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer valid-token'
        },
        body: {
          batchSize: 50,
          requireHumanApproval: true,
          approvalThreshold: 0.9
        }
      });

      await startWorkflow(req);

      expect(res._getStatusCode()).toBe(200);
      const jsonData = JSON.parse(res._getData());
      expect(jsonData.success).toBe(true);
      expect(jsonData.workflowId).toBeDefined();
      expect(jsonData.batchId).toBeDefined();
    });

    it('should validate request body', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer valid-token'
        },
        body: {
          batchSize: -1, // Invalid
          approvalThreshold: 2 // Invalid
        }
      });

      await startWorkflow(req);

      expect(res._getStatusCode()).toBe(400);
      const jsonData = JSON.parse(res._getData());
      expect(jsonData.error).toBeDefined();
    });

    it('should enforce authentication', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          'content-type': 'application/json'
          // No authorization header
        },
        body: {
          batchSize: 50
        }
      });

      await startWorkflow(req);

      expect(res._getStatusCode()).toBe(401);
      expect(JSON.parse(res._getData()).error).toBe('Unauthorized');
    });
  });

  describe('GET /workflow/[batchId]/status', () => {
    it('should get workflow status successfully', async () => {
      const { req, res } = createMocks({
        method: 'GET',
        headers: {
          'authorization': 'Bearer valid-token'
        },
        params: {
          batchId: 'BATCH001'
        }
      });

      await getStatus(req);

      expect(res._getStatusCode()).toBe(200);
      const jsonData = JSON.parse(res._getData());
      expect(jsonData.success).toBe(true);
      expect(jsonData.data.batchId).toBe('BATCH001');
    });
  });
});
```

### Database Integration Testing

```javascript
// __tests__/integration/bigquery.test.js
import { getCashClearingMcpClient } from '@/src/services/cashClearingMcpClient';

describe('BigQuery Integration', () => {
  let client;

  beforeAll(async () => {
    // Use test dataset
    process.env.BIGQUERY_DATASET = 'test_dataset';
    client = getCashClearingMcpClient();
    
    // Setup test data
    await setupTestData();
  });

  afterAll(async () => {
    // Cleanup test data
    await cleanupTestData();
  });

  describe('Transaction Queries', () => {
    it('should retrieve unprocessed transactions', async () => {
      const transactions = await client.getUnprocessedTransactions(10);

      expect(Array.isArray(transactions)).toBe(true);
      expect(transactions.length).toBeLessThanOrEqual(10);
      
      transactions.forEach(tx => {
        expect(tx.pattern).toBe('T_NOTFOUND');
        expect(tx.bt_id).toBeDefined();
        expect(tx.amount).toBeGreaterThan(0);
      });
    });

    it('should filter transactions by date range', async () => {
      const query = `
        SELECT * FROM test_dataset.cash_transactions
        WHERE pattern = 'T_NOTFOUND'
        AND transaction_date BETWEEN '2024-01-01' AND '2024-01-31'
      `;

      const transactions = await client.executeQueryWithRetry(query);

      transactions.forEach(tx => {
        const date = new Date(tx.transaction_date);
        expect(date >= new Date('2024-01-01')).toBe(true);
        expect(date <= new Date('2024-01-31')).toBe(true);
      });
    });
  });

  describe('Pattern Operations', () => {
    it('should retrieve active processor patterns', async () => {
      const patterns = await client.getActiveProcessorPatterns('ACC001', 'CREDIT');

      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns.length).toBeGreaterThan(0);

      patterns.forEach(pattern => {
        expect(pattern.is_active).toBe(true);
        expect(pattern.pattern_op).toBeDefined();
        expect(pattern.confidence_weight).toBeGreaterThan(0);
      });
    });

    it('should retrieve GL mappings for pattern', async () => {
      const glMappings = await client.getGLPatternsForPattern('SETTLEMENT');

      expect(Array.isArray(glMappings)).toBe(true);
      
      glMappings.forEach(mapping => {
        expect(mapping.pattern).toBe('SETTLEMENT');
        expect(mapping.GL_ACCOUNT).toBeDefined();
        expect(mapping.FT_ID).toBeDefined();
      });
    });
  });

  describe('Suggestion Operations', () => {
    it('should insert and retrieve suggestions', async () => {
      const suggestions = [{
        transaction_id: 'TEST_TXN_001',
        bt_id: 'TEST_TXN_001',
        pattern_matched: 'SETTLEMENT',
        confidence_score: 0.92,
        gl_account_code: '1200',
        amount: 1500.50,
        reasoning: { test: true }
      }];

      await client.insertCashClearingSuggestions(suggestions);

      const query = `
        SELECT * FROM test_dataset.ai_cash_clearing_suggestions
        WHERE bt_id = 'TEST_TXN_001'
      `;

      const results = await client.executeQueryWithRetry(query);

      expect(results.length).toBe(1);
      expect(results[0].AI_SUGGEST_TEXT).toBe('SETTLEMENT');
      expect(results[0].AI_CONFIDENCE_SCORE).toBe(0.92);
    });

    it('should update suggestion approval status', async () => {
      const suggestionId = 'TEST_SUG_001';
      
      await client.approveSuggestion(suggestionId, 'test@example.com', 'Test approval');

      const query = `
        SELECT * FROM test_dataset.ai_cash_clearing_suggestions
        WHERE suggestion_id = '${suggestionId}'
      `;

      const results = await client.executeQueryWithRetry(query);

      expect(results[0].approval_status).toBe('APPROVED');
      expect(results[0].approved_by).toBe('test@example.com');
      expect(results[0].approved_at).toBeDefined();
    });
  });
});
```

## End-to-End Testing

### Playwright E2E Tests

```typescript
// e2e/cashClearing.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Cash Clearing Workflow E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'testpassword');
    await page.click('button[type="submit"]');
    
    // Navigate to cash clearing
    await page.waitForURL('/dashboard');
    await page.click('a[href="/cash-clearing"]');
  });

  test('complete workflow from start to finish', async ({ page }) => {
    // 1. Start workflow
    await page.click('button:text("Start New Workflow")');
    
    // Fill workflow parameters
    await page.fill('input[name="batchSize"]', '10');
    await page.check('input[name="requireHumanApproval"]');
    await page.fill('input[name="approvalThreshold"]', '0.9');
    
    await page.click('button:text("Start Processing")');

    // Wait for workflow to start
    await expect(page.locator('text=Workflow started successfully')).toBeVisible();

    // 2. Monitor progress
    await expect(page.locator('[data-testid="workflow-status"]')).toContainText('RUNNING');
    
    // Wait for pattern matching
    await page.waitForSelector('text=Pattern Matching Complete', { timeout: 30000 });

    // 3. Review pending approvals
    await page.click('a:text("Pending Approvals")');
    
    // Should have pending items
    const pendingCount = await page.locator('[data-testid="pending-approval-row"]').count();
    expect(pendingCount).toBeGreaterThan(0);

    // 4. Approve first transaction
    await page.click('[data-testid="pending-approval-row"]:first-child');
    
    // Review details
    await expect(page.locator('[data-testid="confidence-score"]')).toBeVisible();
    await expect(page.locator('[data-testid="gl-account"]')).toBeVisible();
    
    // Approve
    await page.click('button:text("Approve")');
    await page.fill('textarea[name="reason"]', 'Pattern match confirmed');
    await page.click('button:text("Confirm Approval")');

    // 5. Verify completion
    await page.goto('/cash-clearing/workflows');
    
    const workflowRow = page.locator('[data-testid="workflow-row"]:first-child');
    await expect(workflowRow).toContainText('COMPLETED');
  });

  test('batch approval workflow', async ({ page }) => {
    // Navigate to pending approvals
    await page.goto('/cash-clearing/approvals?status=PENDING');

    // Select multiple transactions
    await page.check('[data-testid="select-all-checkbox"]');
    
    const selectedCount = await page.locator('input[type="checkbox"]:checked').count();
    expect(selectedCount).toBeGreaterThan(1);

    // Batch approve
    await page.click('button:text("Batch Actions")');
    await page.click('button:text("Approve Selected")');
    
    // Confirm batch operation
    await page.fill('textarea[name="batchReason"]', 'Batch approval for verified patterns');
    await page.click('button:text("Confirm Batch Approval")');

    // Verify success
    await expect(page.locator('text=Successfully approved')).toBeVisible();
  });

  test('transaction filtering and search', async ({ page }) => {
    await page.goto('/cash-clearing/transactions');

    // Test search
    await page.fill('input[placeholder="Search transactions..."]', 'SETTLEMENT');
    await page.keyboard.press('Enter');

    // Verify filtered results
    const rows = page.locator('[data-testid="transaction-row"]');
    const count = await rows.count();
    
    for (let i = 0; i < count; i++) {
      const text = await rows.nth(i).textContent();
      expect(text?.toLowerCase()).toContain('settlement');
    }

    // Test advanced filters
    await page.click('button:text("Advanced Filters")');
    
    // Filter by confidence score
    await page.fill('input[name="confidenceMin"]', '0.8');
    await page.click('button:text("Apply Filters")');

    // Verify confidence scores
    const confidenceElements = page.locator('[data-testid="confidence-score"]');
    const confidenceCount = await confidenceElements.count();
    
    for (let i = 0; i < confidenceCount; i++) {
      const score = await confidenceElements.nth(i).getAttribute('data-score');
      expect(parseFloat(score || '0')).toBeGreaterThanOrEqual(0.8);
    }
  });

  test('export functionality', async ({ page }) => {
    await page.goto('/cash-clearing/transactions');

    // Select transactions
    await page.check('[data-testid="transaction-checkbox"]:nth-child(1)');
    await page.check('[data-testid="transaction-checkbox"]:nth-child(2)');

    // Export
    await page.click('button:text("Export")');
    await page.selectOption('select[name="format"]', 'csv');
    
    // Start download
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:text("Download CSV")');
    const download = await downloadPromise;

    // Verify download
    expect(download.suggestedFilename()).toMatch(/cash_clearing_export.*\.csv/);
  });
});
```

### API E2E Tests

```javascript
// e2e/api.test.js
import axios from 'axios';

const API_BASE_URL = process.env.API_URL || 'http://localhost:3000/api';

describe('Cash Clearing API E2E', () => {
  let authToken;
  let workflowId;
  let batchId;

  beforeAll(async () => {
    // Authenticate
    const authResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: 'test@example.com',
      password: 'testpassword'
    });

    authToken = authResponse.data.token;
  });

  test('complete workflow via API', async () => {
    // 1. Start workflow
    const startResponse = await axios.post(
      `${API_BASE_URL}/cash-clearing/workflow/start`,
      {
        batchSize: 5,
        requireHumanApproval: true,
        approvalThreshold: 0.85
      },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    expect(startResponse.status).toBe(200);
    expect(startResponse.data.success).toBe(true);
    
    workflowId = startResponse.data.workflowId;
    batchId = startResponse.data.batchId;

    // 2. Poll for status
    let status;
    let attempts = 0;
    
    while (attempts < 30) { // Max 30 attempts
      const statusResponse = await axios.get(
        `${API_BASE_URL}/cash-clearing/workflow/${batchId}/status`,
        {
          headers: { Authorization: `Bearer ${authToken}` }
        }
      );

      status = statusResponse.data.data.workflowStatus;
      
      if (status === 'PAUSED' || status === 'COMPLETED') {
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      attempts++;
    }

    expect(['PAUSED', 'COMPLETED']).toContain(status);

    // 3. Get pending approvals
    const approvalsResponse = await axios.get(
      `${API_BASE_URL}/cash-clearing/approvals?batchId=${batchId}&status=PENDING`,
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    expect(approvalsResponse.data.data.length).toBeGreaterThan(0);

    // 4. Approve first suggestion
    const firstApproval = approvalsResponse.data.data[0];
    
    const approveResponse = await axios.post(
      `${API_BASE_URL}/cash-clearing/approvals/${firstApproval.suggestion_id}/approve`,
      {
        reason: 'E2E test approval'
      },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    expect(approveResponse.status).toBe(200);

    // 5. Verify metrics
    const metricsResponse = await axios.get(
      `${API_BASE_URL}/cash-clearing/metrics`,
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    expect(metricsResponse.data.data.totalWorkflows).toBeGreaterThan(0);
  });
});
```

## Performance Testing

### K6 Load Testing Script

```javascript
// performance/load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '2m', target: 50 },   // Ramp up to 50 users
    { duration: '5m', target: 50 },   // Stay at 50 users
    { duration: '2m', target: 100 },  // Ramp up to 100 users
    { duration: '5m', target: 100 },  // Stay at 100 users
    { duration: '2m', target: 0 },    // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    errors: ['rate<0.1'],             // Error rate under 10%
  },
};

const BASE_URL = 'https://api.example.com';
const AUTH_TOKEN = __ENV.AUTH_TOKEN;

export default function() {
  const headers = {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json',
  };

  // Scenario 1: Get transactions
  const transactionsResponse = http.get(
    `${BASE_URL}/api/cash-clearing/transactions?limit=100`,
    { headers }
  );

  check(transactionsResponse, {
    'transactions status 200': (r) => r.status === 200,
    'transactions response time < 500ms': (r) => r.timings.duration < 500,
  });

  errorRate.add(transactionsResponse.status !== 200);

  sleep(1);

  // Scenario 2: Get pending approvals
  const approvalsResponse = http.get(
    `${BASE_URL}/api/cash-clearing/approvals?status=PENDING`,
    { headers }
  );

  check(approvalsResponse, {
    'approvals status 200': (r) => r.status === 200,
    'approvals response time < 300ms': (r) => r.timings.duration < 300,
  });

  errorRate.add(approvalsResponse.status !== 200);

  sleep(1);

  // Scenario 3: Approve suggestion (if available)
  if (approvalsResponse.status === 200) {
    const approvals = JSON.parse(approvalsResponse.body).data;
    
    if (approvals && approvals.length > 0) {
      const suggestionId = approvals[0].suggestion_id;
      
      const approveResponse = http.post(
        `${BASE_URL}/api/cash-clearing/approvals/${suggestionId}/approve`,
        JSON.stringify({ reason: 'Load test approval' }),
        { headers }
      );

      check(approveResponse, {
        'approve status 200': (r) => r.status === 200,
        'approve response time < 1000ms': (r) => r.timings.duration < 1000,
      });

      errorRate.add(approveResponse.status !== 200);
    }
  }

  sleep(2);
}

export function handleSummary(data) {
  return {
    'summary.html': htmlReport(data),
    'summary.json': JSON.stringify(data),
  };
}
```

### Stress Testing Script

```javascript
// performance/stress-test.js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '5m', target: 200 },   // Ramp up to 200 users
    { duration: '10m', target: 200 },  // Stay at 200 users
    { duration: '5m', target: 400 },   // Ramp up to 400 users
    { duration: '10m', target: 400 },  // Stay at 400 users
    { duration: '5m', target: 0 },     // Ramp down
  ],
};

export default function() {
  // Heavy operation: Start workflow
  const response = http.post(
    'https://api.example.com/api/cash-clearing/workflow/start',
    JSON.stringify({
      batchSize: 1000,
      requireHumanApproval: false,
    }),
    {
      headers: {
        'Authorization': `Bearer ${__ENV.AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );

  check(response, {
    'workflow started': (r) => r.status === 200,
    'no timeout': (r) => r.timings.duration < 30000,
  });
}
```

## Security Testing

### Security Test Suite

```javascript
// security/security.test.js
import axios from 'axios';

describe('Security Tests', () => {
  const API_URL = process.env.API_URL;

  describe('Authentication', () => {
    test('should reject requests without auth token', async () => {
      try {
        await axios.get(`${API_URL}/api/cash-clearing/transactions`);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(401);
      }
    });

    test('should reject requests with invalid token', async () => {
      try {
        await axios.get(`${API_URL}/api/cash-clearing/transactions`, {
          headers: { Authorization: 'Bearer invalid-token' }
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(401);
      }
    });

    test('should reject expired tokens', async () => {
      const expiredToken = 'eyJ...'; // Expired JWT token
      
      try {
        await axios.get(`${API_URL}/api/cash-clearing/transactions`, {
          headers: { Authorization: `Bearer ${expiredToken}` }
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(401);
        expect(error.response.data.error).toContain('expired');
      }
    });
  });

  describe('Authorization', () => {
    let userToken;
    let adminToken;

    beforeAll(async () => {
      // Get tokens for different roles
      userToken = await getAuthToken('user@example.com', 'password');
      adminToken = await getAuthToken('admin@example.com', 'password');
    });

    test('should enforce role-based access', async () => {
      // User should not be able to start workflow
      try {
        await axios.post(
          `${API_URL}/api/cash-clearing/workflow/start`,
          { batchSize: 10 },
          { headers: { Authorization: `Bearer ${userToken}` } }
        );
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(403);
      }

      // Admin should be able to start workflow
      const response = await axios.post(
        `${API_URL}/api/cash-clearing/workflow/start`,
        { batchSize: 10 },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      
      expect(response.status).toBe(200);
    });
  });

  describe('Input Validation', () => {
    test('should prevent SQL injection', async () => {
      const maliciousInput = "'; DROP TABLE cash_transactions; --";
      
      const response = await axios.get(
        `${API_URL}/api/cash-clearing/transactions`,
        {
          params: { search: maliciousInput },
          headers: { Authorization: `Bearer ${validToken}` }
        }
      );

      expect(response.status).toBe(200);
      // Verify tables still exist by making another query
      const verifyResponse = await axios.get(
        `${API_URL}/api/cash-clearing/transactions`,
        { headers: { Authorization: `Bearer ${validToken}` } }
      );
      
      expect(verifyResponse.status).toBe(200);
    });

    test('should prevent XSS attacks', async () => {
      const xssPayload = '<script>alert("XSS")</script>';
      
      const response = await axios.post(
        `${API_URL}/api/cash-clearing/approvals/123/approve`,
        { reason: xssPayload },
        { headers: { Authorization: `Bearer ${validToken}` } }
      );

      // Verify the payload is escaped when returned
      const approvalResponse = await axios.get(
        `${API_URL}/api/cash-clearing/approvals/123`,
        { headers: { Authorization: `Bearer ${validToken}` } }
      );

      expect(approvalResponse.data.reason).not.toContain('<script>');
      expect(approvalResponse.data.reason).toContain('&lt;script&gt;');
    });
  });

  describe('Rate Limiting', () => {
    test('should enforce rate limits', async () => {
      const requests = [];
      
      // Make 10 rapid requests
      for (let i = 0; i < 10; i++) {
        requests.push(
          axios.post(
            `${API_URL}/api/cash-clearing/workflow/start`,
            { batchSize: 10 },
            { headers: { Authorization: `Bearer ${validToken}` } }
          ).catch(e => e.response)
        );
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(r => r.status === 429);
      
      expect(rateLimited.length).toBeGreaterThan(0);
      expect(rateLimited[0].headers['retry-after']).toBeDefined();
    });
  });
});
```

## Test Data Management

### Test Data Setup Script

```javascript
// scripts/setupTestData.js
import { BigQuery } from '@google-cloud/bigquery';

const bigquery = new BigQuery({
  projectId: 'test-project',
  keyFilename: './test-service-account.json'
});

const dataset = bigquery.dataset('test_dataset');

export async function setupTestData() {
  console.log('Setting up test data...');

  // Create test transactions
  const transactions = generateTestTransactions(100);
  await dataset.table('cash_transactions').insert(transactions);

  // Create test patterns
  const patterns = [
    {
      pattern_id: 'TEST_PAT_001',
      pattern_search: 'SETTLEMENT',
      pattern_op: 'SETTLEMENT',
      confidence_weight: 0.9,
      is_active: true
    },
    {
      pattern_id: 'TEST_PAT_002',
      pattern_search: 'TOPUP',
      pattern_op: 'TOPUP',
      confidence_weight: 0.85,
      is_active: true
    },
    // ... more patterns
  ];

  await dataset.table('cash_processor_patterns').insert(patterns);

  // Create GL mappings
  const glMappings = [
    {
      gl_pattern_id: 'TEST_GL_001',
      pattern: 'SETTLEMENT',
      GL_ACCOUNT: '1200',
      FT_ID: 'FT001',
      gl_account_name: 'Cash Settlement Account',
      is_active: true
    },
    // ... more mappings
  ];

  await dataset.table('cash_gl_patterns').insert(glMappings);

  console.log('Test data setup complete');
}

function generateTestTransactions(count) {
  const transactions = [];
  const patterns = ['SETTLEMENT', 'TOPUP', 'FOREX', 'WIRE_TRANSFER', 'PAYMENT'];
  
  for (let i = 0; i < count; i++) {
    const pattern = patterns[Math.floor(Math.random() * patterns.length)];
    
    transactions.push({
      bt_id: `TEST_TXN_${String(i).padStart(6, '0')}`,
      transaction_id: `TEST_TXN_${String(i).padStart(6, '0')}`,
      customer_account_number: `ACC${String(Math.floor(i / 10) + 1).padStart(3, '0')}`,
      type_code: Math.random() > 0.5 ? 'CREDIT' : 'DEBIT',
      text: `${pattern} transaction for testing - ${generateRandomText()}`,
      pattern: 'T_NOTFOUND',
      amount: Math.floor(Math.random() * 10000) + 100,
      transaction_date: generateRandomDate(),
      currency_code: 'USD',
      source_system: 'TEST_SYSTEM'
    });
  }

  return transactions;
}

function generateRandomText() {
  const words = ['payment', 'transfer', 'settlement', 'invoice', 'order', 'reference'];
  const count = Math.floor(Math.random() * 3) + 2;
  
  return Array.from({ length: count }, () => 
    words[Math.floor(Math.random() * words.length)]
  ).join(' ');
}

function generateRandomDate() {
  const start = new Date('2024-01-01');
  const end = new Date();
  
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime())
  ).toISOString().split('T')[0];
}

export async function cleanupTestData() {
  console.log('Cleaning up test data...');

  // Delete test transactions
  await bigquery.query({
    query: `DELETE FROM ${dataset.id}.cash_transactions WHERE bt_id LIKE 'TEST_%'`
  });

  // Delete test patterns
  await bigquery.query({
    query: `DELETE FROM ${dataset.id}.cash_processor_patterns WHERE pattern_id LIKE 'TEST_%'`
  });

  // Delete test GL mappings
  await bigquery.query({
    query: `DELETE FROM ${dataset.id}.cash_gl_patterns WHERE gl_pattern_id LIKE 'TEST_%'`
  });

  // Delete test suggestions
  await bigquery.query({
    query: `DELETE FROM ${dataset.id}.ai_cash_clearing_suggestions WHERE bt_id LIKE 'TEST_%'`
  });

  console.log('Test data cleanup complete');
}
```

### Test Data Factories

```typescript
// test/factories/transactionFactory.ts
import { faker } from '@faker-js/faker';
import type { CashTransaction, CashClearingSuggestion } from '@/lib/types';

export class TransactionFactory {
  static create(overrides?: Partial<CashTransaction>): CashTransaction {
    return {
      bt_id: faker.string.alphanumeric(10),
      transaction_id: faker.string.alphanumeric(10),
      amount: faker.number.float({ min: 100, max: 10000, precision: 0.01 }),
      reference_number: faker.string.alphanumeric(8),
      description: faker.helpers.arrayElement([
        'SETTLEMENT payment from account',
        'TOPUP transaction for wallet',
        'FOREX exchange USD to EUR',
        'WIRE_TRANSFER to beneficiary',
        'ACH_PAYMENT for invoice'
      ]) + ' ' + faker.string.alphanumeric(6),
      transaction_date: faker.date.recent().toISOString().split('T')[0],
      account_id: `ACC${faker.number.int({ min: 1, max: 999 }).toString().padStart(3, '0')}`,
      currency_code: faker.helpers.arrayElement(['USD', 'EUR', 'GBP']),
      pattern: 'T_NOTFOUND',
      source_system: faker.helpers.arrayElement(['CORE', 'SWIFT', 'ACH']),
      ...overrides
    };
  }

  static createBatch(count: number, overrides?: Partial<CashTransaction>): CashTransaction[] {
    return Array.from({ length: count }, () => this.create(overrides));
  }
}

export class SuggestionFactory {
  static create(transaction: CashTransaction, overrides?: Partial<CashClearingSuggestion>): CashClearingSuggestion {
    const patterns = ['SETTLEMENT', 'TOPUP', 'FOREX', 'WIRE_TRANSFER', 'ACH_PAYMENT'];
    const pattern = faker.helpers.arrayElement(patterns);
    
    return {
      suggestion_id: faker.string.uuid(),
      transaction_id: transaction.transaction_id,
      bt_id: transaction.bt_id,
      workflow_step: 4,
      pattern_matched: pattern,
      gl_account_code: faker.helpers.arrayElement(['1100', '1200', '2100', '4100', '5100']),
      gl_account_name: faker.helpers.arrayElement([
        'Cash Settlement Account',
        'Wire Transfer Clearing',
        'Customer Deposits',
        'Foreign Exchange Revenue',
        'Processing Expense'
      ]),
      debit_credit_indicator: faker.helpers.arrayElement(['DR', 'CR']),
      amount: transaction.amount,
      confidence_score: faker.number.float({ min: 0.5, max: 1, precision: 0.01 }),
      reasoning: {
        pattern_match_details: { pattern, strength: 'high' },
        gl_mapping_logic: { selected: true },
        ai_analysis: 'Pattern identified with high confidence',
        validation_checks: { all_passed: true }
      },
      approval_status: faker.helpers.arrayElement(['PENDING', 'APPROVED', 'REJECTED', 'AUTO_APPROVED']),
      ai_model: 'gpt-4-turbo',
      processing_time_ms: faker.number.int({ min: 100, max: 2000 }),
      ...overrides
    };
  }

  static createBatch(
    transactions: CashTransaction[], 
    overrides?: Partial<CashClearingSuggestion>
  ): CashClearingSuggestion[] {
    return transactions.map(tx => this.create(tx, overrides));
  }
}
```

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/cash-clearing-tests.yml
name: Cash Clearing Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

env:
  NODE_VERSION: '18'
  BIGQUERY_PROJECT_ID: 'test-project'
  BIGQUERY_DATASET: 'ci_test_dataset'

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run unit tests
      run: npm run test:unit -- --coverage
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/coverage-final.json
        flags: unittests

  integration-tests:
    runs-on: ubuntu-latest
    needs: unit-tests
    
    services:
      bigquery-emulator:
        image: ghcr.io/goccy/bigquery-emulator:latest
        ports:
          - 9050:9050
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: ${{ env.NODE_VERSION }}
    
    - name: Install dependencies
      run: npm ci
    
    - name: Setup test database
      run: |
        npm run db:setup:test
        npm run db:seed:test
    
    - name: Run integration tests
      run: npm run test:integration
      env:
        BIGQUERY_EMULATOR_HOST: localhost:9050

  e2e-tests:
    runs-on: ubuntu-latest
    needs: integration-tests
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: ${{ env.NODE_VERSION }}
    
    - name: Install dependencies
      run: npm ci
    
    - name: Install Playwright
      run: npx playwright install --with-deps
    
    - name: Build application
      run: npm run build
    
    - name: Run E2E tests
      run: npm run test:e2e
    
    - name: Upload test results
      if: always()
      uses: actions/upload-artifact@v3
      with:
        name: playwright-report
        path: playwright-report/

  performance-tests:
    runs-on: ubuntu-latest
    needs: e2e-tests
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup K6
      run: |
        sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
        echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
        sudo apt-get update
        sudo apt-get install k6
    
    - name: Run performance tests
      run: |
        k6 run performance/load-test.js \
          --out json=performance-results.json \
          --summary-export=summary.json
    
    - name: Upload performance results
      uses: actions/upload-artifact@v3
      with:
        name: performance-results
        path: |
          performance-results.json
          summary.json

  security-scan:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Run security audit
      run: npm audit --production
    
    - name: Run SAST scan
      uses: securego/gosec@master
      with:
        args: ./...
    
    - name: Run dependency check
      uses: dependency-check/Dependency-Check_Action@main
      with:
        project: 'cash-clearing'
        path: '.'
        format: 'HTML'
```

### NPM Scripts

```json
{
  "scripts": {
    "test": "jest",
    "test:unit": "jest --testPathPattern=__tests__",
    "test:integration": "jest --testPathPattern=integration",
    "test:e2e": "playwright test",
    "test:performance": "k6 run performance/load-test.js",
    "test:security": "npm audit && npm run test:security:owasp",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:ci": "npm run test:unit && npm run test:integration",
    "db:setup:test": "node scripts/setupTestDatabase.js",
    "db:seed:test": "node scripts/setupTestData.js",
    "db:cleanup:test": "node scripts/cleanupTestData.js"
  }
}
```

## Testing Best Practices

### 1. Test Organization
- Keep tests close to the code they test
- Use descriptive test names
- Group related tests with `describe` blocks
- Follow AAA pattern: Arrange, Act, Assert

### 2. Mock Management
```javascript
// Use MSW for API mocking
import { setupServer } from 'msw/node';
import { rest } from 'msw';

const server = setupServer(
  rest.get('/api/cash-clearing/transactions', (req, res, ctx) => {
    return res(ctx.json({ data: mockTransactions }));
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### 3. Test Data Management
- Use factories for consistent test data
- Clean up test data after each test
- Use separate test database/dataset
- Avoid hardcoded values

### 4. Async Testing
```javascript
// Always use async/await for clarity
test('async operation', async () => {
  const result = await someAsyncOperation();
  expect(result).toBeDefined();
});

// Use waitFor for eventual consistency
await waitFor(() => {
  expect(screen.getByText('Success')).toBeInTheDocument();
});
```

### 5. Component Testing
- Test user interactions, not implementation
- Use data-testid for reliable element selection
- Test accessibility features
- Verify error states

### 6. Performance Testing
- Set clear performance budgets
- Test with realistic data volumes
- Monitor memory usage
- Test under various network conditions

### 7. Security Testing
- Regular dependency audits
- Input validation testing
- Authentication/authorization testing
- SQL injection prevention
- XSS prevention

### 8. Continuous Improvement
- Monitor test coverage trends
- Review failed tests regularly
- Update tests with bug fixes
- Refactor tests for maintainability

## Troubleshooting Common Test Issues

### BigQuery Connection Issues
```bash
# Check service account permissions
gcloud projects get-iam-policy PROJECT_ID

# Test BigQuery connection
bq ls -d --project_id=PROJECT_ID

# Use emulator for local testing
export BIGQUERY_EMULATOR_HOST=localhost:9050
```

### Flaky Tests
- Add proper wait conditions
- Avoid testing implementation details
- Use stable selectors
- Mock external dependencies

### Slow Tests
- Use test parallelization
- Optimize database queries
- Use in-memory databases for unit tests
- Implement proper test data cleanup

### Coverage Issues
- Focus on critical paths
- Test edge cases
- Don't aim for 100% coverage
- Prioritize integration tests