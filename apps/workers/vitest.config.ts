import base from "../../vitest.config.ts"
import { PGLITE_HOOK_TIMEOUT_MS } from "../../packages/vitest-config/index.ts"
import { defineConfig, mergeConfig } from "vitest/config"

export default mergeConfig(
  base,
  defineConfig({
    test: {
      hookTimeout: PGLITE_HOOK_TIMEOUT_MS,
      onConsoleLog: () => false,
    },
  }),
)
