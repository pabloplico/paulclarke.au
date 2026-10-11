type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';

interface LogContext {
  [key: string]: unknown;
}

interface Logger {
  debug(message: string, ctx?: LogContext): void;
  info(message: string, ctx?: LogContext): void;
  warn(message: string, ctx?: LogContext): void;
  error(message: string, ctx?: LogContext): void;
  child(ctx: LogContext): Logger;
}

function createLogger(baseContext: LogContext = {}): Logger {
  function emit(severity: LogLevel, message: string, extra?: LogContext) {
    const entry = {
      severity,
      message,
      timestamp: new Date().toISOString(),
      ...baseContext,
      ...extra,
    };
    const line = JSON.stringify(entry);
    if (severity === 'ERROR' || severity === 'WARNING') {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  return {
    debug: (message, ctx) => emit('DEBUG', message, ctx),
    info: (message, ctx) => emit('INFO', message, ctx),
    warn: (message, ctx) => emit('WARNING', message, ctx),
    error: (message, ctx) => emit('ERROR', message, ctx),
    child: (ctx) => createLogger({ ...baseContext, ...ctx }),
  };
}

export const logger = createLogger();
