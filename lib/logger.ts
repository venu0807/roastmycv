// lib/logger.ts — Structured JSON logging with correlation IDs
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  time: string;
  level: LogLevel;
  message: string;
  correlationId?: string;
  [key: string]: any;
}

let correlationIdCounter = 0;
const generateCorrelationId = () => `${Date.now()}-${++correlationIdCounter}-${Math.random().toString(36).slice(2, 8)}`;

const isDevelopment = process.env.NODE_ENV === 'development';

function formatEntry(entry: LogEntry): string {
  if (isDevelopment) {
    const { time, level, message, correlationId, ...rest } = entry;
    const restStr = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
    return `[${time}] [${level.toUpperCase()}] [${correlationId}] ${message}${restStr}`;
  }
  return JSON.stringify(entry);
}

function log(level: LogLevel, message: string, meta?: Record<string, any>) {
  const entry: LogEntry = {
    time: new Date().toISOString(),
    level,
    message,
    correlationId: generateCorrelationId(),
    ...meta,
  };
  console[level === 'debug' ? 'log' : level](formatEntry(entry));
}

export const logger = {
  debug: (message: string, meta?: Record<string, any>) => log('debug', message, meta),
  info: (message: string, meta?: Record<string, any>) => log('info', message, meta),
  warn: (message: string, meta?: Record<string, any>) => log('warn', message, meta),
  error: (message: string, meta?: Record<string, any>) => log('error', message, meta),

  // Convenience for API routes
  apiRequest: (method: string, path: string, meta?: Record<string, any>) =>
    log('info', `${method} ${path}`, { type: 'api_request', method, path, ...meta }),
  apiResponse: (method: string, path: string, status: number, durationMs: number, meta?: Record<string, any>) =>
    log(status >= 400 ? 'warn' : 'info', `${method} ${path} → ${status}`, {
      type: 'api_response', method, path, status, durationMs, ...meta
    }),
  apiError: (method: string, path: string, error: Error, meta?: Record<string, any>) =>
    log('error', `${method} ${path} → ERROR`, {
      type: 'api_error', method, path, error: error.message, stack: error.stack, ...meta
    }),
};