import { defineConfig, mergeConfig } from "vitest/config"
import base from "../../vitest.config.ts"
import { PGLITE_HOOK_TIMEOUT_MS } from "../../packages/vitest-config/index.ts"

export default mergeConfig(
  base,
  defineConfig({
    test: {
      hookTimeout: PGLITE_HOOK_TIMEOUT_MS,
    },
  }),
)
