import { Request, Response, NextFunction } from 'express';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const defaultLevel: LogLevel = process.env.DEBUG === 'true' ? 'debug' : 'info';
const configuredLevel = normalizeLogLevel(process.env.LOG_LEVEL) ?? defaultLevel;
export const currentLogLevel: LogLevel = configuredLevel;

function normalizeLogLevel(level?: string | null): LogLevel | undefined {
  if (!level) return undefined;
  const lowered = level.toLowerCase();
  if (['debug', 'info', 'warn', 'error'].includes(lowered)) {
    return lowered as LogLevel;
  }
  return undefined;
}

function shouldLog(level: LogLevel): boolean {
  return levelPriority[level] >= levelPriority[configuredLevel];
}

function sanitizeContext(context?: Record<string, unknown>) {
  if (!context) return undefined;
  const sanitized: Record<string, unknown> = { ...context };

  if (sanitized.sessionId && typeof sanitized.sessionId === 'string') {
    sanitized.sessionId = maskSessionId(sanitized.sessionId);
  }

  return sanitized;
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>) {
  if (!shouldLog(level)) return;

  const timestamp = new Date().toISOString();
  const payload = sanitizeContext(context);
  const output =
    payload && Object.keys(payload).length > 0
      ? ` ${JSON.stringify(payload)}`
      : '';

  const formatted = `[${timestamp}] [${level.toUpperCase()}] ${message}${output}`;

  switch (level) {
    case 'warn':
      console.warn(formatted);
      break;
    case 'error':
      console.error(formatted);
      break;
    default:
      console.log(formatted);
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) =>
    log('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) =>
    log('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) =>
    log('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) =>
    log('error', message, context),
};

export function maskSessionId(sessionId?: string) {
  if (!sessionId) return undefined;
  return `${sessionId.substring(0, 8)}...`;
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  logger.debug('Request start', {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    sessionId: req.sessionID,
  });

  res.on('finish', () => {
    logger.debug('Request complete', {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
      sessionId: req.sessionID,
    });
  });

  next();
}
