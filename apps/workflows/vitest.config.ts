import { defineConfig, mergeConfig } from "vitest/config"
import base from "../../vitest.config.ts"

export default mergeConfig(
  base,
  defineConfig({
    test: {
      onConsoleLog: () => false,
    },
  }),
)
