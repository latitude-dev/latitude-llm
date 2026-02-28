import { Effect } from "effect";

export const createLogger = (scope: string) => {
  return {
    info: (message: string) => Effect.runSync(Effect.logInfo(`[${scope}] ${message}`)),
  };
};
