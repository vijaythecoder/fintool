'use client';

interface TransactionData {
  transaction_id?: string;
  transaction_amount?: number | string;
  customer_account?: string;
  transaction_date?: string;
  data_type?: string;
  description?: string;
  [key: string]: any; // Allow for additional fields
}

interface FinancialDataTableProps {
  data: TransactionData[] | any[];
  title?: string;
}

export function FinancialDataTable({ data, title }: FinancialDataTableProps) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="text-gray-500 dark:text-gray-400 text-center py-4">
        No data available
      </div>
    );
  }

  // Get all unique keys from the data
  const allKeys = Array.from(
    new Set(data.flatMap(item => Object.keys(item)))
  );

  // Format currency values
  const formatValue = (value: any, key: string) => {
    if (value === null || value === undefined) return '-';
    
    // Format currency for amount fields
    if (key.toLowerCase().includes('amount') && typeof value === 'number') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    }
    
    // Format dates
    if (key.toLowerCase().includes('date') && value) {
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
        }
      } catch (e) {
        // If date parsing fails, return original value
      }
    }
    
    return String(value);
  };

  // Format header names
  const formatHeader = (key: string) => {
    return key
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  return (
    <div className="my-4">
      {title && (
        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">
          {title}
        </h3>
      )}
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              {allKeys.map((key) => (
                <th
                  key={key}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider"
                >
                  {formatHeader(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
            {data.map((item, rowIndex) => (
              <tr
                key={rowIndex}
                className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                {allKeys.map((key) => (
                  <td
                    key={key}
                    className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap"
                  >
                    {formatValue(item[key], key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Showing {data.length} {data.length === 1 ? 'record' : 'records'}
      </div>
    </div>
  );
}