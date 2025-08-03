'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
        // Custom table styling
        table: ({ children }) => (
          <div className="overflow-x-auto my-4">
            <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700 border border-gray-300 dark:border-gray-700 rounded-lg">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-gray-50/50 dark:bg-gray-800/50">{children}</thead>
        ),
        tbody: ({ children }) => (
          <tbody className="bg-white/50 dark:bg-gray-900/50 divide-y divide-gray-200 dark:divide-gray-800">
            {children}
          </tbody>
        ),
        tr: ({ children }) => (
          <tr className="hover:bg-gray-100/50 dark:hover:bg-gray-700/50 transition-colors">
            {children}
          </tr>
        ),
        th: ({ children }) => (
          <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-3 text-sm whitespace-nowrap">
            {children}
          </td>
        ),
        // Style other markdown elements
        p: ({ children }) => (
          <p className="mb-2">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="list-disc list-inside mb-2">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside mb-2">
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="mb-1">{children}</li>
        ),
        code: ({ children }) => (
          <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm">
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded overflow-x-auto mb-2">
            {children}
          </pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 my-2 italic">
            {children}
          </blockquote>
        ),
        h1: ({ children }) => (
          <h1 className="text-2xl font-bold mb-2">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-xl font-semibold mb-2">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-lg font-semibold mb-2">
            {children}
          </h3>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  );
}