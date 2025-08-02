import winston from 'winston';
import { format } from 'winston';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logLevel = process.env.LOG_LEVEL || 'info';
const logDir = process.env.LOG_DIR || join(__dirname, '../../logs');

const customFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  format.splat(),
  format.json(),
  format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    if (Object.keys(metadata).length > 0) {
      msg += ` | ${JSON.stringify(metadata)}`;
    }
    
    return msg;
  })
);

const consoleFormat = format.combine(
  format.colorize(),
  format.timestamp({ format: 'HH:mm:ss' }),
  format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} ${level}: ${message}`;
    
    if (metadata.error) {
      msg += `\n${metadata.error}`;
    }
    
    return msg;
  })
);

const transports = [
  new winston.transports.Console({
    format: consoleFormat,
    level: logLevel
  })
];

if (process.env.NODE_ENV === 'production') {
  transports.push(
    new winston.transports.File({
      filename: join(logDir, 'error.log'),
      level: 'error',
      format: customFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: join(logDir, 'combined.log'),
      format: customFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  );
}

export const logger = winston.createLogger({
  level: logLevel,
  format: customFormat,
  transports,
  exitOnError: false
});

logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

export function createChildLogger(module) {
  return logger.child({ module });
}

export function logPerformance(operation, startTime) {
  const duration = Date.now() - startTime;
  logger.info(`Performance: ${operation} completed in ${duration}ms`, {
    operation,
    duration,
    timestamp: new Date().toISOString()
  });
}

export function logTransaction(action, transactionId, details = {}) {
  logger.info(`Transaction ${action}: ${transactionId}`, {
    action,
    transactionId,
    ...details,
    timestamp: new Date().toISOString()
  });
}

export default logger;