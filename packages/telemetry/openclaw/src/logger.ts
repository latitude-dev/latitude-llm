const PREFIX = "[latitude-openclaw]"

export interface Logger {
  debug: (msg: string) => void
  warn: (msg: string) => void
}

/** Shape of OpenClaw's `api.logger`; lines written through it land in the gateway log. */
export interface HostLogger {
  debug?: (message: string) => void
  info: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
}

export function createLogger(debugEnabled: boolean, host?: HostLogger): Logger {
  // Host debug output is usually filtered out of the gateway log, so debug lines go through info.
  const debugSink = host ? (msg: string) => host.info(`${PREFIX} ${msg}`) : (msg: string) => writeStderr(msg)
  const warnSink = host ? (msg: string) => host.warn(`${PREFIX} ${msg}`) : (msg: string) => writeStderr(msg)
  return {
    debug: debugEnabled ? debugSink : () => {},
    warn: warnSink,
  }
}

function writeStderr(msg: string): void {
  process.stderr.write(`${PREFIX} ${msg}\n`)
}
