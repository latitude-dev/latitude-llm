import base from "../../vitest.config.ts"
import { defineConfig, mergeConfig } from "vitest/config"

/** PGlite + Drizzle migrations can exceed the default 10s under parallel turbo runs. */
const pgliteHookTimeoutMs = 60_000

export default mergeConfig(
  base,
  defineConfig({
    test: {
      hookTimeout: pgliteHookTimeoutMs,
      onConsoleLog: () => false,
    },
  }),
)
