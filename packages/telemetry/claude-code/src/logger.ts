const PREFIX = "[latitude-claude-code]"

export interface Logger {
  debug: (msg: string) => void
  warn: (msg: string) => void
}

export function createLogger(debugEnabled: boolean): Logger {
  return {
    debug: debugEnabled ? (msg) => process.stderr.write(`${PREFIX} ${msg}\n`) : () => {},
    warn: (msg) => process.stderr.write(`${PREFIX} ${msg}\n`),
  }
}
