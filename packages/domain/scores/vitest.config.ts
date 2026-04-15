import base from "@repo/vitest-config"
import { defineConfig, mergeConfig } from "vitest/config"

export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ["src/**/*.{test,spec}.ts"],
      exclude: ["dist/**", "node_modules/**"],
    },
  }),
)
