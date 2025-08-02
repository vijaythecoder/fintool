// Re-export the MCP client functionality for use in Next.js
// This is a wrapper to make the existing MCP client work in the Next.js environment

export { getBigQueryTools, closeMCPConnection } from '@/src/services/mcpClient';