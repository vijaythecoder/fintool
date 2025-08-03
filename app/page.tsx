'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import { useState, useRef, useEffect } from 'react';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { FinancialDataTable } from '@/components/financial-data-table';
import { ToolExecutionDisplay } from '@/components/tool-execution-display';
import { DemoResults } from '@/components/demo-results';

export default function ChatPage() {
  const [input, setInput] = useState('');
  const [showDemo, setShowDemo] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { messages, sendMessage, status, stop, error } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onFinish: (message) => {
      console.log('Message finished:', message);
      console.log('Last message parts:', messages[messages.length - 1]?.parts);
    },
  });

  // Log errors to console for debugging
  if (error) {
    console.error('Chat error:', error);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      const messageText = input.trim();
      // Clear input immediately for better UX
      setInput('');
      try {
        await sendMessage({ text: messageText });
      } catch (err) {
        console.error('Error sending message:', err);
        // Restore input on error
        setInput(messageText);
      }
    }
  };

  const isLoading = status === 'streaming' || status === 'submitted';

  // Scroll to bottom function
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Auto-scroll when messages change or status changes
  useEffect(() => {
    scrollToBottom();
  }, [messages, status]);

  // Auto-focus input when response is complete
  useEffect(() => {
    if (!isLoading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLoading]);

  return (
    <div className="flex flex-col h-screen w-full">
      <header className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Financial Data Chat
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">
              Ask questions about your financial transactions using natural language
            </p>
          </div>
          <button
            onClick={() => setShowDemo(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            View UI Demo
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-7xl mx-auto space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <div className="max-w-2xl mx-auto">
              <div className="mb-8">
                <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="white" className="w-8 h-8">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Welcome to Financial Data Chat
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Ask questions about your financial data using natural language. I'll query BigQuery and present results in a beautiful, easy-to-understand format.
                </p>
              </div>
              
              <div className="grid gap-3 md:grid-cols-1 max-w-lg mx-auto">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                     onClick={() => setInput("Show me unmatched transactions from yesterday")}>
                  <div className="flex items-center space-x-2">
                    <div className="w-5 h-5 text-blue-600 dark:text-blue-400">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                      </svg>
                    </div>
                    <span className="text-blue-700 dark:text-blue-300 font-medium text-sm">
                      "Show me unmatched transactions from yesterday"
                    </span>
                  </div>
                </div>
                
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10 border border-green-200 dark:border-green-800 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                     onClick={() => setInput("What's the success rate for cash clearing this week?")}>
                  <div className="flex items-center space-x-2">
                    <div className="w-5 h-5 text-green-600 dark:text-green-400">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/>
                      </svg>
                    </div>
                    <span className="text-green-700 dark:text-green-300 font-medium text-sm">
                      "What's the success rate for cash clearing this week?"
                    </span>
                  </div>
                </div>
                
                <div className="bg-gradient-to-r from-purple-50 to-violet-50 dark:from-purple-900/10 dark:to-violet-900/10 border border-purple-200 dark:border-purple-800 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                     onClick={() => setInput("Find transactions with amount > $10,000")}>
                  <div className="flex items-center space-x-2">
                    <div className="w-5 h-5 text-purple-600 dark:text-purple-400">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M7 4V2C7 1.45 7.45 1 8 1S9 1.45 9 2V4H15V2C15 1.45 15.45 1 16 1S17 1.45 17 2V4H20C20.55 4 21 4.45 21 5V8H3V5C3 4.45 3.45 4 4 4H7ZM3 19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V10H3V19ZM12 12H17V17H12V12Z"/>
                      </svg>
                    </div>
                    <span className="text-purple-700 dark:text-purple-300 font-medium text-sm">
                      "Find transactions with amount {'>'} $10,000"
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="mt-6 text-xs text-gray-500 dark:text-gray-400">
                Click any example to try it, or type your own question below
              </div>
            </div>
          </div>
        )}

        {messages.map(message => (
          <div
            key={message.id}
            className={`flex ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-3xl px-4 py-3 rounded-lg ${
                message.role === 'user'
                  ? 'bg-gray-700 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700'
              }`}
            >
              {message.parts?.map((part, index) => {
                const isFirstPart = index === 0;
                const content = (() => {
                  switch (part.type) {
                    case 'text':
                      return <MarkdownRenderer key={index} content={part.text} />;
                    
                    case 'dynamic-tool':
                      // Handle MCP tools which come as dynamic-tool
                      return <ToolExecutionDisplay key={index} part={part} index={index} />;
                    
                    default:
                      // Handle any other tool types
                      if (part.type?.startsWith('tool-')) {
                        return (
                          <div key={index} className="mt-2 p-2 bg-gray-50 dark:bg-gray-700 rounded">
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                              Tool: {part.type.replace('tool-', '')}
                            </p>
                            {(part as any).state === 'output-available' && (
                              <div className="mt-2">{(part as any).output}</div>
                            )}
                          </div>
                        );
                      }
                      return null;
                  }
                })();
                
                // Add spacing between parts, but not before the first part
                return (
                  <div key={index} className={!isFirstPart ? 'mt-4' : ''}>
                    {content}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-700 px-6 py-4 rounded-lg shadow-sm">
              <div className="flex items-center space-x-3">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-100"></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-200"></div>
                </div>
                <span className="text-blue-700 dark:text-blue-300 text-sm font-medium">
                  AI is thinking...
                </span>
              </div>
            </div>
          </div>
        )}
        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-6 py-4">
        <form onSubmit={handleSubmit} className="max-w-7xl mx-auto">
          <div className="flex space-x-3">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your financial data..."
              className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input?.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              Send
            </button>
            {isLoading && (
              <button
                type="button"
                onClick={() => stop()}
                className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Stop
              </button>
            )}
          </div>
        </form>
      </div>

      {showDemo && <DemoResults onClose={() => setShowDemo(false)} />}
    </div>
  );
}