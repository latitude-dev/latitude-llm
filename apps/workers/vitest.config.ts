import { defineConfig, mergeConfig } from "vitest/config"
import { PGLITE_HOOK_TIMEOUT_MS } from "../../packages/vitest-config/index.ts"
import base from "../../vitest.config.ts"

export default mergeConfig(
  base,
  defineConfig({
    test: {
      hookTimeout: PGLITE_HOOK_TIMEOUT_MS,
      onConsoleLog: () => false,
    },
  }),
)
