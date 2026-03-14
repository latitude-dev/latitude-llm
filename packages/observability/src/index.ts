import { Effect } from "effect"

export const createLogger = (scope: string) => {
  return {
    info: (...args: unknown[]) => Effect.runSync(Effect.logInfo(`[${scope}]`, ...args)),
    warn: (...args: unknown[]) => Effect.runSync(Effect.logWarning(`[${scope}]`, ...args)),
    error: (...args: unknown[]) => Effect.runSync(Effect.logError(`[${scope}]`, ...args)),
  }
}
