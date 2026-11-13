/* eslint-disable no-console -- this module is the app's console sink; console use is intentional here */
type LogLevel = 'info' | 'warn' | 'error'

function write(level: LogLevel, moduleName: string, message: string, data?: unknown): void {
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${moduleName}] ${message}`
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  sink(line, data || '')
}

/** A console logger that prefixes every line with a timestamp, level and module name. */
export const createModuleLogger = (moduleName: string) => ({
  info: (message: string, data?: unknown) => write('info', moduleName, message, data),
  warn: (message: string, data?: unknown) => write('warn', moduleName, message, data),
  error: (message: string, data?: unknown) => write('error', moduleName, message, data),
})
