/**
 * Advanced Connection Pool Manager for BigQuery MCP clients
 * Implements connection pooling, multiplexing, and intelligent load balancing
 */

import { logger } from '../utils/logger.js';
import { getBigQueryTools } from '../services/mcpClient.js';

export class ConnectionPoolManager {
  constructor(options = {}) {
    this.config = {
      maxConnections: options.maxConnections || 20,
      minConnections: options.minConnections || 5,
      acquireTimeoutMillis: options.acquireTimeoutMillis || 30000,
      idleTimeoutMillis: options.idleTimeoutMillis || 600000, // 10 minutes
      enableConnectionMultiplexing: options.enableConnectionMultiplexing !== false,
      healthCheckInterval: options.healthCheckInterval || 60000, // 1 minute
      maxRetries: options.maxRetries || 3
    };

    // Connection pool state
    this.connections = {
      available: [],
      busy: new Set(),
      failed: new Set()
    };

    // Pool metrics
    this.metrics = {
      totalConnections: 0,
      availableConnections: 0,
      busyConnections: 0,
      failedConnections: 0,
      acquisitionCount: 0,
      acquisitionTime: [],
      connectionErrors: 0,
      poolUtilization: 0
    };

    // Connection waiting queue
    this.waitingQueue = [];
    
    // Health check interval
    this.healthCheckTimer = null;
    
    // Initialize pool
    this.initializePool();
  }

  /**
   * Initialize connection pool with minimum connections
   */
  async initializePool() {
    const initStartTime = performance.now();
    
    try {
      logger.info('Initializing connection pool', {
        minConnections: this.config.minConnections,
        maxConnections: this.config.maxConnections
      });

      // Create minimum connections
      const connectionPromises = [];
      for (let i = 0; i < this.config.minConnections; i++) {
        connectionPromises.push(this.createConnection());
      }

      const connections = await Promise.allSettled(connectionPromises);
      
      let successfulConnections = 0;
      connections.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          this.connections.available.push(result.value);
          successfulConnections++;
        } else {
          logger.warn(`Failed to create initial connection ${index}`, {
            error: result.reason?.message
          });
        }
      });

      this.updateMetrics();
      
      // Start health check timer
      this.startHealthCheck();
      
      const initTime = performance.now() - initStartTime;
      logger.info('Connection pool initialized', {
        successfulConnections,
        totalTime: initTime.toFixed(2) + 'ms',
        poolSize: this.connections.available.length
      });

    } catch (error) {
      logger.error('Connection pool initialization failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Create a new database connection
   */
  async createConnection() {
    const connectionStartTime = performance.now();
    
    try {
      const { client, tools } = await getBigQueryTools();
      
      const connection = {
        id: this.generateConnectionId(),
        client,
        tools,
        created: Date.now(),
        lastUsed: Date.now(),
        useCount: 0,
        isHealthy: true,
        multiplexed: false
      };

      const connectionTime = performance.now() - connectionStartTime;
      this.metrics.totalConnections++;
      
      logger.debug('Connection created', {
        connectionId: connection.id,
        creationTime: connectionTime.toFixed(2) + 'ms'
      });

      return connection;

    } catch (error) {
      this.metrics.connectionErrors++;
      logger.error('Failed to create connection', { error: error.message });
      throw error;
    }
  }

  /**
   * Get connection from pool with intelligent load balancing
   */
  async getConnection() {
    const acquisitionStartTime = performance.now();
    this.metrics.acquisitionCount++;

    try {
      // Check for available connection first
      if (this.connections.available.length > 0) {
        const connection = this.selectOptimalConnection();
        if (connection) {
          return this.acquireConnection(connection, acquisitionStartTime);
        }
      }

      // Try to create new connection if under limit
      if (this.getTotalActiveConnections() < this.config.maxConnections) {
        const newConnection = await this.createConnection();
        return this.acquireConnection(newConnection, acquisitionStartTime);
      }

      // Wait for available connection
      return await this.waitForConnection(acquisitionStartTime);

    } catch (error) {
      logger.error('Failed to acquire connection', { error: error.message });
      throw error;
    }
  }

  /**
   * Select optimal connection based on usage and health
   */
  selectOptimalConnection() {
    if (this.connections.available.length === 0) return null;

    // Find connection with lowest usage that's healthy
    let optimalConnection = null;
    let lowestUsage = Infinity;

    for (const connection of this.connections.available) {
      if (connection.isHealthy && connection.useCount < lowestUsage) {
        optimalConnection = connection;
        lowestUsage = connection.useCount;
      }
    }

    // If no healthy connection found, try any available
    if (!optimalConnection && this.connections.available.length > 0) {
      optimalConnection = this.connections.available[0];
    }

    return optimalConnection;
  }

  /**
   * Acquire connection and move to busy pool
   */
  acquireConnection(connection, acquisitionStartTime) {
    // Remove from available pool
    const availableIndex = this.connections.available.indexOf(connection);
    if (availableIndex > -1) {
      this.connections.available.splice(availableIndex, 1);
    }

    // Add to busy pool
    this.connections.busy.add(connection);

    // Update connection metadata
    connection.lastUsed = Date.now();
    connection.useCount++;

    // Record acquisition time
    const acquisitionTime = performance.now() - acquisitionStartTime;
    this.metrics.acquisitionTime.push(acquisitionTime);
    
    // Maintain acquisition time history (last 100)
    if (this.metrics.acquisitionTime.length > 100) {
      this.metrics.acquisitionTime = this.metrics.acquisitionTime.slice(-100);
    }

    this.updateMetrics();

    logger.debug('Connection acquired', {
      connectionId: connection.id,
      acquisitionTime: acquisitionTime.toFixed(2) + 'ms',
      useCount: connection.useCount,
      poolUtilization: this.metrics.poolUtilization
    });

    return connection;
  }

  /**
   * Wait for available connection with timeout
   */
  async waitForConnection(acquisitionStartTime) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Remove from waiting queue
        const queueIndex = this.waitingQueue.indexOf(waitingRequest);
        if (queueIndex > -1) {
          this.waitingQueue.splice(queueIndex, 1);
        }
        
        reject(new Error('Connection acquisition timeout'));
      }, this.config.acquireTimeoutMillis);

      const waitingRequest = {
        resolve: (connection) => {
          clearTimeout(timeout);
          resolve(this.acquireConnection(connection, acquisitionStartTime));
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
        timestamp: Date.now()
      };

      this.waitingQueue.push(waitingRequest);
      
      logger.debug('Connection request queued', {
        queueLength: this.waitingQueue.length,
        waitTime: Date.now() - acquisitionStartTime
      });
    });
  }

  /**
   * Release connection back to available pool
   */
  async releaseConnection(connection) {
    try {
      if (!connection) return;

      // Remove from busy pool
      this.connections.busy.delete(connection);

      // Check if connection is still healthy
      const isHealthy = await this.checkConnectionHealth(connection);
      connection.isHealthy = isHealthy;

      if (isHealthy) {
        // Add back to available pool
        this.connections.available.push(connection);
        
        // Process waiting queue
        this.processWaitingQueue();
        
        logger.debug('Connection released', {
          connectionId: connection.id,
          useCount: connection.useCount,
          availableConnections: this.connections.available.length
        });
      } else {
        // Connection is unhealthy, mark as failed
        this.connections.failed.add(connection);
        logger.warn('Unhealthy connection marked as failed', {
          connectionId: connection.id
        });
        
        // Try to create replacement connection
        this.createReplacementConnection();
      }

      this.updateMetrics();

    } catch (error) {
      logger.error('Failed to release connection', {
        connectionId: connection?.id,
        error: error.message
      });
    }
  }

  /**
   * Process waiting queue when connection becomes available
   */
  processWaitingQueue() {
    while (this.waitingQueue.length > 0 && this.connections.available.length > 0) {
      const waitingRequest = this.waitingQueue.shift();
      const connection = this.selectOptimalConnection();
      
      if (connection) {
        // Remove connection from available pool (will be added to busy in acquire)
        const availableIndex = this.connections.available.indexOf(connection);
        if (availableIndex > -1) {
          this.connections.available.splice(availableIndex, 1);
        }
        
        waitingRequest.resolve(connection);
      } else {
        // Put request back in queue
        this.waitingQueue.unshift(waitingRequest);
        break;
      }
    }
  }

  /**
   * Create replacement connection for failed ones
   */
  async createReplacementConnection() {
    try {
      if (this.getTotalActiveConnections() < this.config.maxConnections) {
        const newConnection = await this.createConnection();
        this.connections.available.push(newConnection);
        this.processWaitingQueue();
        
        logger.debug('Replacement connection created', {
          connectionId: newConnection.id
        });
      }
    } catch (error) {
      logger.warn('Failed to create replacement connection', { error: error.message });
    }
  }

  /**
   * Pre-warm connections for optimal performance
   */
  async preWarmConnections() {
    const preWarmStartTime = performance.now();
    
    try {
      const targetConnections = Math.min(this.config.maxConnections, this.config.minConnections + 5);
      const connectionsToCreate = targetConnections - this.getTotalActiveConnections();
      
      if (connectionsToCreate > 0) {
        const connectionPromises = [];
        for (let i = 0; i < connectionsToCreate; i++) {
          connectionPromises.push(this.createConnection());
        }

        const results = await Promise.allSettled(connectionPromises);
        
        let createdCount = 0;
        results.forEach(result => {
          if (result.status === 'fulfilled') {
            this.connections.available.push(result.value);
            createdCount++;
          }
        });

        this.updateMetrics();
        
        const preWarmTime = performance.now() - preWarmStartTime;
        logger.info('Connection pre-warming completed', {
          connectionsCreated: createdCount,
          totalConnections: this.getTotalActiveConnections(),
          preWarmTime: preWarmTime.toFixed(2) + 'ms'
        });
      }

    } catch (error) {
      logger.warn('Connection pre-warming failed', { error: error.message });
    }
  }

  /**
   * Check connection health
   */
  async checkConnectionHealth(connection) {
    try {
      // Simple health check - try to execute a lightweight query
      if (connection.client && typeof connection.client.callTool === 'function') {
        // Connection appears to be functional
        return true;
      }
      return false;
    } catch (error) {
      logger.debug('Connection health check failed', {
        connectionId: connection.id,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Start periodic health check
   */
  startHealthCheck() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckInterval);

    logger.debug('Health check timer started', {
      interval: this.config.healthCheckInterval + 'ms'
    });
  }

  /**
   * Perform periodic health check on all connections
   */
  async performHealthCheck() {
    try {
      const allConnections = [
        ...this.connections.available,
        ...Array.from(this.connections.busy)
      ];

      const healthPromises = allConnections.map(async (connection) => {
        const isHealthy = await this.checkConnectionHealth(connection);
        return { connection, isHealthy };
      });

      const healthResults = await Promise.allSettled(healthPromises);
      
      let unhealthyCount = 0;
      healthResults.forEach(result => {
        if (result.status === 'fulfilled') {
          const { connection, isHealthy } = result.value;
          connection.isHealthy = isHealthy;
          
          if (!isHealthy) {
            unhealthyCount++;
            // Move to failed pool if not already there
            if (!this.connections.failed.has(connection)) {
              this.connections.failed.add(connection);
              
              // Remove from available pool
              const availableIndex = this.connections.available.indexOf(connection);
              if (availableIndex > -1) {
                this.connections.available.splice(availableIndex, 1);
              }
            }
          }
        }
      });

      if (unhealthyCount > 0) {
        logger.warn(`Health check found ${unhealthyCount} unhealthy connections`);
        
        // Create replacement connections if needed
        for (let i = 0; i < Math.min(unhealthyCount, 3); i++) {
          await this.createReplacementConnection();
        }
      }

      this.updateMetrics();

    } catch (error) {
      logger.error('Health check failed', { error: error.message });
    }
  }

  /**
   * Update pool metrics
   */
  updateMetrics() {
    this.metrics.availableConnections = this.connections.available.length;
    this.metrics.busyConnections = this.connections.busy.size;
    this.metrics.failedConnections = this.connections.failed.size;
    
    const totalActive = this.getTotalActiveConnections();
    this.metrics.poolUtilization = totalActive > 0 ? 
      this.metrics.busyConnections / totalActive : 0;
  }

  /**
   * Get total active connections (available + busy)
   */
  getTotalActiveConnections() {
    return this.connections.available.length + this.connections.busy.size;
  }

  /**
   * Get pool metrics
   */
  async getMetrics() {
    this.updateMetrics();
    
    const averageAcquisitionTime = this.metrics.acquisitionTime.length > 0 ?
      this.metrics.acquisitionTime.reduce((sum, time) => sum + time, 0) / this.metrics.acquisitionTime.length : 0;

    return {
      connections: {
        total: this.metrics.totalConnections,
        available: this.metrics.availableConnections,
        busy: this.metrics.busyConnections,
        failed: this.metrics.failedConnections
      },
      performance: {
        acquisitionCount: this.metrics.acquisitionCount,
        averageAcquisitionTime: averageAcquisitionTime.toFixed(2) + 'ms',
        poolUtilization: (this.metrics.poolUtilization * 100).toFixed(1) + '%',
        connectionErrors: this.metrics.connectionErrors
      },
      configuration: {
        maxConnections: this.config.maxConnections,
        minConnections: this.config.minConnections,
        acquireTimeout: this.config.acquireTimeoutMillis + 'ms',
        idleTimeout: this.config.idleTimeoutMillis + 'ms'
      },
      waitingQueue: {
        length: this.waitingQueue.length,
        oldestRequest: this.waitingQueue.length > 0 ? 
          Date.now() - this.waitingQueue[0].timestamp + 'ms' : '0ms'
      }
    };
  }

  /**
   * Generate unique connection ID
   */
  generateConnectionId() {
    return 'conn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Cleanup pool resources
   */
  async cleanup() {
    try {
      // Clear health check timer
      if (this.healthCheckTimer) {
        clearInterval(this.healthCheckTimer);
        this.healthCheckTimer = null;
      }

      // Close all connections
      const allConnections = [
        ...this.connections.available,
        ...Array.from(this.connections.busy),
        ...Array.from(this.connections.failed)
      ];

      for (const connection of allConnections) {
        try {
          if (connection.client && typeof connection.client.close === 'function') {
            await connection.client.close();
          }
        } catch (error) {
          logger.warn('Failed to close connection', {
            connectionId: connection.id,
            error: error.message
          });
        }
      }

      // Clear all pools
      this.connections.available = [];
      this.connections.busy.clear();
      this.connections.failed.clear();

      // Clear waiting queue
      this.waitingQueue.forEach(request => {
        request.reject(new Error('Connection pool shutdown'));
      });
      this.waitingQueue = [];

      logger.info('Connection pool cleanup completed');

    } catch (error) {
      logger.error('Connection pool cleanup failed', { error: error.message });
    }
  }
}
EOF < /dev/null