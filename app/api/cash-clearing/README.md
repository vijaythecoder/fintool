# Cash Clearing API Documentation

This API provides comprehensive endpoints for managing the cash clearing approval workflow. Built with Next.js 14 App Router, TypeScript, and BigQuery integration.

## Base URL
```
https://your-domain.com/api/cash-clearing
```

## Authentication

All endpoints require authentication via one of the following methods:

### API Key Authentication
```bash
curl -H "X-API-Key: your-api-key" https://your-domain.com/api/cash-clearing/transactions
```

### Bearer Token Authentication
```bash
curl -H "Authorization: Bearer your-jwt-token" https://your-domain.com/api/cash-clearing/transactions
```

## Rate Limits

| Operation | Limit | Window |
|-----------|-------|--------|
| Workflow Start | 5 requests | 1 hour |
| Workflow Status | 100 requests | 1 hour |
| Transaction Read | 1000 requests | 1 hour |
| Approval Actions | 200 requests | 1 hour |
| Batch Operations | 20 requests | 1 hour |
| Metrics | 100 requests | 1 hour |

## API Endpoints

### 1. Workflow Management

#### Start New Workflow
```http
POST /api/cash-clearing/workflow/start
```

**Request Body:**
```json
{
  "batchSize": 100,
  "requireHumanApproval": true,
  "approvalThreshold": 0.9,
  "maxConcurrentSteps": 1,
  "enableAuditLog": true,
  "filters": {
    "dateRange": {
      "startDate": "2024-01-01",
      "endDate": "2024-01-31"
    },
    "amountRange": {
      "minAmount": 1000,
      "maxAmount": 50000
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "workflowId": "workflow_1704067200_abc123",
  "batchId": "batch_1704067200_xyz789",
  "estimatedTransactions": 250,
  "estimatedProcessingTime": "2m 5s",
  "status": "RUNNING",
  "statusUrl": "/api/cash-clearing/workflow/batch_1704067200_xyz789/status",
  "message": "Workflow started successfully with 250 transactions"
}
```

#### Get Workflow Status
```http
GET /api/cash-clearing/workflow/{batchId}/status
```

**Response:**
```json
{
  "success": true,
  "workflowId": "workflow_1704067200_abc123",
  "batchId": "batch_1704067200_xyz789",
  "status": "RUNNING",
  "currentStep": 2,
  "progress": {
    "totalTransactions": 250,
    "processedTransactions": 150,
    "failedTransactions": 5,
    "percentComplete": 60.0,
    "estimatedTimeRemaining": "45s"
  },
  "stepDetails": {
    "step1": {
      "name": "Query Cash Transactions",
      "status": "completed",
      "completedAt": "2024-01-01T10:00:00Z",
      "transactionCount": 250
    },
    "step2": {
      "name": "Pattern Matching",
      "status": "running",
      "transactionCount": 150
    }
  },
  "approvals": {
    "pending": 25,
    "approved": 120,
    "rejected": 5,
    "autoApproved": 95
  }
}
```

#### Pause Workflow
```http
POST /api/cash-clearing/workflow/{batchId}/pause
```

**Request Body:**
```json
{
  "reason": "Manual pause for review",
  "gracefulShutdown": true,
  "saveState": true
}
```

#### Resume Workflow
```http
POST /api/cash-clearing/workflow/{batchId}/resume
```

**Request Body:**
```json
{
  "reason": "Resume after review",
  "restartFromStep": 3,
  "updateConfig": {
    "approvalThreshold": 0.85
  }
}
```

### 2. Transaction Operations

#### Get Transactions
```http
GET /api/cash-clearing/transactions?limit=50&status=unprocessed&sortBy=amount&sortOrder=desc
```

**Query Parameters:**
- `limit` (1-1000): Number of records to return
- `offset` (0+): Starting record offset
- `status`: `unprocessed` | `processed` | `failed` | `all`
- `pattern`: Filter by pattern
- `dateFrom/dateTo`: Date range filter
- `amountMin/amountMax`: Amount range filter
- `sortBy`: `transaction_date` | `amount` | `created_at`
- `sortOrder`: `asc` | `desc`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "transaction_id": "txn_123",
      "amount": 5000.00,
      "description": "Wire transfer from ABC Corp",
      "transaction_date": "2024-01-01",
      "account_id": "ACC_001",
      "currency_code": "USD",
      "pattern": "T_NOTFOUND",
      "suggestions_count": 2,
      "latest_suggestion": {
        "suggestion_id": "sug_456",
        "approval_status": "PENDING",
        "confidence_score": 0.85,
        "gl_account_code": "1001"
      }
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 1250,
    "hasMore": true,
    "currentPage": 1,
    "totalPages": 25
  }
}
```

#### Get Transaction Details
```http
GET /api/cash-clearing/transactions/{transactionId}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "transaction": {
      "transaction_id": "txn_123",
      "amount": 5000.00,
      "description": "Wire transfer from ABC Corp",
      "transaction_date": "2024-01-01",
      "account_id": "ACC_001"
    },
    "suggestions": [
      {
        "suggestion_id": "sug_456",
        "confidence_score": 0.85,
        "gl_account_code": "1001",
        "approval_status": "PENDING",
        "reasoning": {
          "pattern_match_details": {},
          "ai_analysis": "High confidence wire transfer pattern"
        }
      }
    ],
    "patterns": [],
    "glMappings": [],
    "auditLog": [],
    "relatedTransactions": []
  }
}
```

#### Process Transactions
```http
POST /api/cash-clearing/transactions/process
```

**Request Body:**
```json
{
  "transactionIds": ["txn_123", "txn_124", "txn_125"],
  "processingOptions": {
    "batchSize": 10,
    "requireHumanApproval": true,
    "approvalThreshold": 0.9,
    "targetStep": 4
  }
}
```

### 3. Approval Operations

#### Get Pending Approvals
```http
GET /api/cash-clearing/approvals?status=PENDING&limit=100&confidenceMin=0.5
```

**Query Parameters:**
- `status`: `PENDING` | `APPROVED` | `REJECTED` | `AUTO_APPROVED` | `ALL`
- `batchId`: Filter by batch
- `confidenceMin/Max`: Confidence score range
- `amountMin/Max`: Amount range
- `glAccountCode`: Filter by GL account

#### Approve Suggestion
```http
POST /api/cash-clearing/approvals/{suggestionId}/approve
```

**Request Body:**
```json
{
  "approvalReason": "Validated GL mapping and amount",
  "overrides": {
    "glAccountCode": "1002",
    "debitCreditIndicator": "DR"
  },
  "notifyApproval": true
}
```

#### Reject Suggestion
```http
POST /api/cash-clearing/approvals/{suggestionId}/reject
```

**Request Body:**
```json
{
  "rejectionReason": "Incorrect GL account mapping",
  "rejectionCategory": "INCORRECT_GL_MAPPING",
  "alternativeAction": "MANUAL_REVIEW_REQUIRED",
  "requestReprocessing": true,
  "reprocessingOptions": {
    "requireHigherConfidence": true
  }
}
```

#### Batch Approve/Reject
```http
POST /api/cash-clearing/approvals/batch
```

**Request Body:**
```json
{
  "suggestionIds": ["sug_123", "sug_124", "sug_125"],
  "action": "APPROVE",
  "batchReason": "Bulk approval of high-confidence suggestions",
  "approvalSettings": {
    "allowPartialFailure": true,
    "stopOnFirstError": false
  }
}
```

### 4. Analytics & Monitoring

#### Get Processing Metrics
```http
GET /api/cash-clearing/metrics?startDate=2024-01-01&endDate=2024-01-31&metricTypes=workflow_performance,approval_rates
```

**Query Parameters:**
- `startDate/endDate`: Date range
- `granularity`: `hour` | `day` | `week` | `month`
- `metricTypes`: Array of metric types
- `includeComparison`: Include comparison with previous period

**Response:**
```json
{
  "success": true,
  "summary": {
    "totalTransactions": 5000,
    "totalWorkflows": 25,
    "averageProcessingTime": 120.5,
    "overallSuccessRate": 0.92,
    "averageConfidence": 0.78,
    "approvalRate": 0.85
  },
  "metrics": {
    "workflow_performance": [
      {
        "date": "2024-01-01",
        "workflows_started": 5,
        "workflows_completed": 4,
        "workflows_failed": 1,
        "success_rate": 0.8
      }
    ]
  },
  "insights": [
    {
      "type": "performance",
      "title": "High Success Rate",
      "description": "92% of workflows completed successfully",
      "severity": "info"
    }
  ]
}
```

#### Get Audit Log
```http
GET /api/cash-clearing/audit-log?workflowId=workflow_123&actionType=APPROVE&limit=100
```

## Error Handling

All endpoints return standardized error responses:

```json
{
  "error": "Validation failed",
  "message": "Invalid request parameters",
  "details": [
    {
      "field": "amount",
      "code": "too_small",
      "message": "Amount must be greater than 0"
    }
  ]
}
```

### HTTP Status Codes

- `200` - Success
- `202` - Accepted (async processing)
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `429` - Rate Limited
- `500` - Internal Server Error

## Webhook Events

The API supports webhook notifications for key events:

### Workflow Events
- `workflow.started`
- `workflow.completed`
- `workflow.failed`
- `workflow.paused`
- `workflow.resumed`

### Approval Events
- `suggestion.approved`
- `suggestion.rejected`
- `batch.approved`
- `batch.rejected`

## SDK Integration

### JavaScript/TypeScript
```typescript
import { CashClearingAPI } from '@/lib/cash-clearing-api';

const api = new CashClearingAPI({
  baseUrl: 'https://your-domain.com/api/cash-clearing',
  apiKey: 'your-api-key'
});

// Start workflow
const workflow = await api.startWorkflow({
  batchSize: 100,
  requireHumanApproval: true
});

// Get transactions
const transactions = await api.getTransactions({
  status: 'unprocessed',
  limit: 50
});

// Approve suggestion
await api.approveSuggestion('sug_123', {
  approvalReason: 'Validated mapping'
});
```

## Testing

### Example cURL Commands

```bash
# Start a workflow
curl -X POST https://your-domain.com/api/cash-clearing/workflow/start \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 50, "requireHumanApproval": true}'

# Get pending approvals
curl https://your-domain.com/api/cash-clearing/approvals?status=PENDING \
  -H "X-API-Key: your-api-key"

# Approve a suggestion
curl -X POST https://your-domain.com/api/cash-clearing/approvals/sug_123/approve \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"approvalReason": "Validated GL mapping"}'
```

## Best Practices

1. **Batch Processing**: Use batch operations for multiple approvals/rejections
2. **Error Handling**: Always check the `success` field in responses
3. **Rate Limiting**: Implement exponential backoff for rate limit responses
4. **Monitoring**: Use the metrics endpoint for monitoring workflow health
5. **Audit Trail**: Leverage audit logs for compliance and debugging
6. **Authentication**: Rotate API keys regularly and use secure storage

## Support

For API support and questions:
- Documentation: `/api/cash-clearing/docs`
- Health Check: `/api/cash-clearing/health`
- API Status: `/api/cash-clearing/status`