'use client';

import React from 'react';

export interface ErrorAlert {
  id: string;
  title: string;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'active' | 'acknowledged' | 'resolved';
  occurredAt: string;
  component?: string;
  errorType?: string;
  affectedCount?: number;
  stackTrace?: string;
  metadata?: Record<string, any>;
}

export interface ErrorAlertCenterProps {
  alerts: ErrorAlert[];
  onAlertAcknowledge?: (alertId: string) => void;
  onAlertResolve?: (alertId: string, resolution: string) => void;
  onFilterChange?: (filters: ErrorAlertFilters) => void;
}

export interface ErrorAlertFilters {
  severity?: 'critical' | 'high' | 'medium' | 'low';
  status?: 'active' | 'acknowledged' | 'resolved';
  component?: string;
  timeRange?: number;
}

export function ErrorAlertCenter({
  alerts,
  onAlertAcknowledge,
  onAlertResolve,
  onFilterChange
}: ErrorAlertCenterProps) {
  return (
    <div className="p-4 border rounded-lg bg-white dark:bg-gray-800">
      <h2 className="text-lg font-semibold mb-4">Error Alert Center</h2>
      <div className="space-y-4">
        {alerts.map((alert) => (
          <div key={alert.id} className="p-3 border rounded">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-medium">{alert.title}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{alert.message}</p>
                <div className="flex gap-2 mt-2">
                  <span className={`px-2 py-1 text-xs rounded ${
                    alert.severity === 'critical' ? 'bg-red-100 text-red-800' :
                    alert.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                    alert.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {alert.severity}
                  </span>
                  <span className="text-xs text-gray-500">
                    {alert.occurredAt}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                {alert.status === 'active' && onAlertAcknowledge && (
                  <button
                    onClick={() => onAlertAcknowledge(alert.id)}
                    className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    Acknowledge
                  </button>
                )}
                {alert.status !== 'resolved' && onAlertResolve && (
                  <button
                    onClick={() => onAlertResolve(alert.id, 'Resolved')}
                    className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
                  >
                    Resolve
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {alerts.length === 0 && (
          <p className="text-center text-gray-500">No alerts</p>
        )}
      </div>
    </div>
  );
}