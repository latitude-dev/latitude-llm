import base from "../../vitest.config.ts"
import { defineConfig, mergeConfig } from "vitest/config"

export default mergeConfig(
  base,
  defineConfig({
    test: {
      onConsoleLog: () => false,
    },
  }),
)
