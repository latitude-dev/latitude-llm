import base from "@repo/vitest-config"
import { defineConfig, mergeConfig } from "vitest/config"

export default mergeConfig(
  base,
  defineConfig({
    test: {
      exclude: ["**/node_modules/**", "**/dist/**"],
    },
  }),
)
