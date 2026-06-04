export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export interface LogContext {
  module?: string
  userId?: string
  action?: string
  [key: string]: unknown
}

interface LogEntry {
  level: LogLevel
  message: string
  context: LogContext
  timestamp: string
  data?: unknown
}

const LOG_STORAGE_KEY = 'fitcore_logs'

class Logger {
  private logs: LogEntry[] = []
  private maxLogs = 100

  private createLogEntry(level: LogLevel, message: string, context: LogContext, data?: unknown): LogEntry {
    return {
      level,
      message,
      context,
      timestamp: new Date().toISOString(),
      data,
    }
  }

  private addLog(entry: LogEntry): void {
    this.logs.push(entry)
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }

    const logMessage = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.context.module || 'App'}] ${entry.message}`

    switch (entry.level) {
      case 'error':
        console.error(logMessage, entry.data || '')
        break
      case 'warn':
        console.warn(logMessage, entry.data || '')
        break
      case 'debug':
        console.debug(logMessage, entry.data || '')
        break
      default:
        console.log(logMessage, entry.data || '')
    }
  }

  info(message: string, context?: LogContext, data?: unknown): void {
    this.addLog(this.createLogEntry('info', message, context || {}, data))
  }

  warn(message: string, context?: LogContext, data?: unknown): void {
    this.addLog(this.createLogEntry('warn', message, context || {}, data))
  }

  error(message: string, context?: LogContext, data?: unknown): void {
    this.addLog(this.createLogEntry('error', message, context || {}, data))
  }

  debug(message: string, context?: LogContext, data?: unknown): void {
    this.addLog(this.createLogEntry('debug', message, context || {}, data))
  }

  getLogs(): LogEntry[] {
    return [...this.logs]
  }

  getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter(log => log.level === level)
  }

  getLogsByModule(module: string): LogEntry[] {
    return this.logs.filter(log => log.context.module === module)
  }

  clearLogs(): void {
    this.logs = []
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2)
  }

  saveToStorage(): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOG_STORAGE_KEY, this.exportLogs())
    }
  }

  loadFromStorage(): void {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(LOG_STORAGE_KEY)
      if (stored) {
        try {
          this.logs = JSON.parse(stored)
        } catch (e) {
          console.error('Failed to parse stored logs:', e)
        }
      }
    }
  }
}

export const logger = new Logger()

export const createModuleLogger = (moduleName: string) => {
  return {
    info: (message: string, data?: unknown) => logger.info(message, { module: moduleName }, data),
    warn: (message: string, data?: unknown) => logger.warn(message, { module: moduleName }, data),
    error: (message: string, data?: unknown) => logger.error(message, { module: moduleName }, data),
    debug: (message: string, data?: unknown) => logger.debug(message, { module: moduleName }, data),
    withContext: (context: LogContext) => ({
      info: (message: string, data?: unknown) => logger.info(message, { ...context, module: moduleName }, data),
      warn: (message: string, data?: unknown) => logger.warn(message, { ...context, module: moduleName }, data),
      error: (message: string, data?: unknown) => logger.error(message, { ...context, module: moduleName }, data),
      debug: (message: string, data?: unknown) => logger.debug(message, { ...context, module: moduleName }, data),
    }),
  }
}
