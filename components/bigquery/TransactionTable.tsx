import React from 'react';
import { format } from 'date-fns';

interface Transaction {
  transaction_id: string;
  amount: number;
  reference_number: string;
  merchant_name: string;
  transaction_date: string;
  status: string;
  match_confidence?: number;
  enrichment_notes?: string;
}

interface TransactionTableProps {
  transactions: Transaction[];
  title?: string;
}

export function TransactionTable({ transactions, title }: TransactionTableProps) {
  if (!transactions || transactions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No transactions found
      </div>
    );
  }

  return (
    <div className="w-full">
      {title && (
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
          {title}
        </h3>
      )}
      <div className="overflow-x-auto shadow-md rounded-lg">
        <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
            <tr>
              <th scope="col" className="px-6 py-3">Transaction ID</th>
              <th scope="col" className="px-6 py-3">Date</th>
              <th scope="col" className="px-6 py-3">Amount</th>
              <th scope="col" className="px-6 py-3">Reference</th>
              <th scope="col" className="px-6 py-3">Merchant</th>
              <th scope="col" className="px-6 py-3">Status</th>
              {transactions.some(t => t.match_confidence !== undefined) && (
                <th scope="col" className="px-6 py-3">Confidence</th>
              )}
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction, index) => (
              <tr
                key={transaction.transaction_id}
                className={`${
                  index % 2 === 0
                    ? 'bg-white dark:bg-gray-900'
                    : 'bg-gray-50 dark:bg-gray-800'
                } border-b dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700`}
              >
                <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                  {transaction.transaction_id}
                </td>
                <td className="px-6 py-4">
                  {format(new Date(transaction.transaction_date), 'MMM dd, yyyy')}
                </td>
                <td className="px-6 py-4 font-semibold">
                  ${transaction.amount.toLocaleString()}
                </td>
                <td className="px-6 py-4">{transaction.reference_number}</td>
                <td className="px-6 py-4">{transaction.merchant_name}</td>
                <td className="px-6 py-4">
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      transaction.status === 'MATCHED'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                        : transaction.status === 'T_NOT_FOUND'
                        ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                    }`}
                  >
                    {transaction.status}
                  </span>
                </td>
                {transaction.match_confidence !== undefined && (
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <span className="text-sm font-medium mr-2">
                        {(transaction.match_confidence * 100).toFixed(0)}%
                      </span>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            transaction.match_confidence >= 0.85
                              ? 'bg-green-600'
                              : transaction.match_confidence >= 0.6
                              ? 'bg-yellow-600'
                              : 'bg-red-600'
                          }`}
                          style={{
                            width: `${transaction.match_confidence * 100}%`,
                          }}
                        ></div>
                      </div>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}