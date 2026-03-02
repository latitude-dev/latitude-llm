import { Effect } from "effect"

export const createLogger = (scope: string) => {
  return {
    info: (message: string) => Effect.runSync(Effect.logInfo(`[${scope}] ${message}`)),
    warn: (message: string) => Effect.runSync(Effect.logWarning(`[${scope}] ${message}`)),
    error: (message: string) => Effect.runSync(Effect.logError(`[${scope}] ${message}`)),
  }
}
