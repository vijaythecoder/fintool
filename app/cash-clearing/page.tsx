'use client';

import React from 'react';
import { CashClearingDashboard } from '@/components/cash-clearing/CashClearingDashboard';
import { useTransactionData } from '@/components/cash-clearing/hooks/useTransactionData';

export default function CashClearingPage() {
  const {
    data,
    isLoading,
    error,
    refresh,
    updateFilters
  } = useTransactionData({}, true, 30000); // Auto-refresh every 30 seconds
  
  // TODO: Implement these action methods
  const approveTransaction = async (id: string) => {
    console.log('Approve transaction:', id);
    // Implementation needed
  };
  
  const rejectTransaction = async (id: string, reason: string) => {
    console.log('Reject transaction:', id, reason);
    // Implementation needed
  };
  
  const batchApprove = async (ids: string[]) => {
    console.log('Batch approve:', ids);
    // Implementation needed
  };
  
  const batchReject = async (ids: string[], reason: string) => {
    console.log('Batch reject:', ids, reason);
    // Implementation needed
  };
  
  const startWorkflow = async () => {
    console.log('Start workflow');
    // Implementation needed
  };
  
  const pauseWorkflow = async () => {
    console.log('Pause workflow');
    // Implementation needed
  };
  
  const resumeWorkflow = async () => {
    console.log('Resume workflow');
    // Implementation needed
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">
              Error Loading Cash Clearing Data
            </h2>
            <p className="text-red-600 dark:text-red-300">{error}</p>
            <button
              onClick={() => refresh()}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Cash Clearing Workflow
          </h1>
          <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">
            AI-powered pattern matching for unprocessed cash transactions
          </p>
        </div>

        <CashClearingDashboard
          workflowState={undefined} // TODO: Fetch workflow state separately
          transactions={data?.transactions || []}
          suggestions={data?.suggestions || []}
          patterns={data?.patterns}
          glMappings={data?.glMappings}
          executionResult={undefined} // TODO: Fetch execution result separately
          onRefresh={refresh}
          onApproveTransaction={approveTransaction}
          onRejectTransaction={rejectTransaction}
          onBatchApprove={batchApprove}
          onBatchReject={batchReject}
          onStartWorkflow={startWorkflow}
          onPauseWorkflow={pauseWorkflow}
          onResumeWorkflow={resumeWorkflow}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}