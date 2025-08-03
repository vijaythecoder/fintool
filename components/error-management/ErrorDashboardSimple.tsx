'use client';

import React from 'react';

export interface ErrorDashboardProps {
  className?: string;
}

export function ErrorDashboard({ className = '' }: ErrorDashboardProps) {
  return (
    <div className={`p-4 border rounded-lg bg-white dark:bg-gray-800 ${className}`}>
      <h2 className="text-lg font-semibold mb-4">Error Dashboard</h2>
      <p className="text-gray-600 dark:text-gray-400">Error monitoring dashboard - UI components pending implementation</p>
    </div>
  );
}