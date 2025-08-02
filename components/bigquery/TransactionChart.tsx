import React from 'react';

interface ChartData {
  date: string;
  matched: number;
  unmatched: number;
  enriched: number;
}

interface TransactionChartProps {
  data: ChartData[];
  title?: string;
}

export function TransactionChart({ data, title }: TransactionChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No chart data available
      </div>
    );
  }

  // Find max value for scaling
  const maxValue = Math.max(
    ...data.flatMap(d => [d.matched, d.unmatched, d.enriched])
  );

  return (
    <div className="w-full bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      {title && (
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
          {title}
        </h3>
      )}
      
      <div className="space-y-4">
        {data.map((item, index) => (
          <div key={index} className="space-y-2">
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
              <span>{item.date}</span>
              <span className="font-medium">
                Total: {item.matched + item.unmatched + item.enriched}
              </span>
            </div>
            
            <div className="relative h-8 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="absolute left-0 top-0 h-full bg-green-500 transition-all duration-500"
                style={{
                  width: `${(item.matched / (item.matched + item.unmatched + item.enriched)) * 100}%`,
                }}
                title={`Matched: ${item.matched}`}
              />
              <div
                className="absolute top-0 h-full bg-yellow-500 transition-all duration-500"
                style={{
                  left: `${(item.matched / (item.matched + item.unmatched + item.enriched)) * 100}%`,
                  width: `${(item.enriched / (item.matched + item.unmatched + item.enriched)) * 100}%`,
                }}
                title={`Enriched: ${item.enriched}`}
              />
              <div
                className="absolute top-0 h-full bg-red-500 transition-all duration-500"
                style={{
                  left: `${((item.matched + item.enriched) / (item.matched + item.unmatched + item.enriched)) * 100}%`,
                  width: `${(item.unmatched / (item.matched + item.unmatched + item.enriched)) * 100}%`,
                }}
                title={`Unmatched: ${item.unmatched}`}
              />
            </div>
            
            <div className="flex justify-between text-xs">
              <span className="flex items-center">
                <span className="w-3 h-3 bg-green-500 rounded-full mr-1"></span>
                Matched: {item.matched}
              </span>
              <span className="flex items-center">
                <span className="w-3 h-3 bg-yellow-500 rounded-full mr-1"></span>
                Enriched: {item.enriched}
              </span>
              <span className="flex items-center">
                <span className="w-3 h-3 bg-red-500 rounded-full mr-1"></span>
                Unmatched: {item.unmatched}
              </span>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-center space-x-6 text-sm">
          <div className="flex items-center">
            <span className="w-4 h-4 bg-green-500 rounded mr-2"></span>
            <span className="text-gray-600 dark:text-gray-400">Matched</span>
          </div>
          <div className="flex items-center">
            <span className="w-4 h-4 bg-yellow-500 rounded mr-2"></span>
            <span className="text-gray-600 dark:text-gray-400">Enriched</span>
          </div>
          <div className="flex items-center">
            <span className="w-4 h-4 bg-red-500 rounded mr-2"></span>
            <span className="text-gray-600 dark:text-gray-400">Unmatched</span>
          </div>
        </div>
      </div>
    </div>
  );
}