export interface Logger {
  debug(message: string): void
  warn(message: string): void
}

export function createLogger(debugEnabled: boolean): Logger {
  return {
    debug(message) {
      if (debugEnabled) process.stderr.write(`[latitude-pi] ${message}\n`)
    },
    warn(message) {
      if (debugEnabled) process.stderr.write(`[latitude-pi] ${message}\n`)
    },
  }
}
