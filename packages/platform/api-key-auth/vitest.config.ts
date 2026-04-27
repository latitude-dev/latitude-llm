import base from "@repo/vitest-config"
import { defineConfig, mergeConfig } from "vitest/config"

export default mergeConfig(
  base,
  defineConfig({
    test: {
      hookTimeout: 30000,
      testTimeout: 30000,
    },
  }),
)
