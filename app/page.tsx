'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import { useState } from 'react';

export default function ChatPage() {
  const [input, setInput] = useState('');
  
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
      try {
        await sendMessage({ text: input });
        setInput('');
      } catch (err) {
        console.error('Error sending message:', err);
      }
    }
  };

  const isLoading = status === 'streaming' || status === 'submitted';

  return (
    <div className="flex flex-col h-screen max-w-5xl mx-auto p-4">
      <header className="mb-8 mt-4">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Financial Data Chat
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Ask questions about your financial transactions using natural language
        </p>
      </header>

      <div className="flex-1 overflow-y-auto mb-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Welcome! You can ask questions like:
            </p>
            <div className="space-y-2 text-sm">
              <p className="text-blue-600 dark:text-blue-400">
                "Show me unmatched transactions from yesterday"
              </p>
              <p className="text-blue-600 dark:text-blue-400">
                "What's the success rate for cash clearing this week?"
              </p>
              <p className="text-blue-600 dark:text-blue-400">
                "Find transactions with amount &gt; $10,000"
              </p>
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
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
              }`}
            >
              {message.parts?.map((part, index) => {
                switch (part.type) {
                  case 'text':
                    return <p key={index} className="whitespace-pre-wrap">{part.text}</p>;
                  
                  case 'tool-invocation':
                    return (
                      <div key={index} className="mt-2 p-2 bg-gray-50 dark:bg-gray-700 rounded">
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                          Tool: {part.toolInvocation?.toolName}
                        </p>
                        {part.toolInvocation?.state === 'result' && (
                          <div className="mt-2">
                            {part.toolInvocation.result}
                          </div>
                        )}
                      </div>
                    );
                  
                  case 'dynamic-tool':
                    // Handle MCP tools which come as dynamic-tool
                    return (
                      <div key={index} className="mt-2">
                        {(part as any).state === 'input-streaming' && (
                          <div className="text-sm text-gray-500">
                            Executing {(part as any).toolName}...
                          </div>
                        )}
                        {(part as any).state === 'input-available' && (
                          <div className="text-sm text-gray-500">
                            Running {(part as any).toolName} with parameters...
                          </div>
                        )}
                        {(part as any).state === 'output-available' && (
                          <div className="mt-2">
                            {/* Handle MCP tool output format */}
                            {(() => {
                              try {
                                const output = (part as any).output;
                                
                                // Handle MCP response format {content, isError}
                                if (output && typeof output === 'object' && 'content' in output) {
                                  if (output.isError) {
                                    return (
                                      <div className="text-red-500">
                                        Error: {output.content}
                                      </div>
                                    );
                                  }
                                  
                                  // Try to parse content as JSON for better display
                                  try {
                                    const parsed = typeof output.content === 'string' 
                                      ? JSON.parse(output.content) 
                                      : output.content;
                                    return (
                                      <pre className="bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto text-sm">
                                        {JSON.stringify(parsed, null, 2)}
                                      </pre>
                                    );
                                  } catch {
                                    // If not JSON, display content as-is
                                    return <div className="whitespace-pre-wrap">{String(output.content)}</div>;
                                  }
                                }
                                
                                // Handle string output
                                if (typeof output === 'string') {
                                  try {
                                    const parsed = JSON.parse(output);
                                    return (
                                      <pre className="bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto text-sm">
                                        {JSON.stringify(parsed, null, 2)}
                                      </pre>
                                    );
                                  } catch {
                                    return <div>{output}</div>;
                                  }
                                }
                                
                                // Fallback for other types
                                return <div>{JSON.stringify(output)}</div>;
                              } catch (error) {
                                console.error('Error rendering tool output:', error);
                                return <div className="text-red-500">Error displaying output</div>;
                              }
                            })()}
                          </div>
                        )}
                        {(part as any).state === 'output-error' && (
                          <div className="text-red-500">
                            Error: {(part as any).errorText}
                          </div>
                        )}
                      </div>
                    );
                  
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
              })}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-800 px-4 py-3 rounded-lg">
              <div className="flex items-center space-x-2">
                <div className="animate-bounce">
                  <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                </div>
                <div className="animate-bounce delay-100">
                  <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                </div>
                <div className="animate-bounce delay-200">
                  <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t pt-4">
        <div className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your financial data..."
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input?.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
          {isLoading && (
            <button
              type="button"
              onClick={() => stop()}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Stop
            </button>
          )}
        </div>
      </form>
    </div>
  );
}