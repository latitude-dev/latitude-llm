import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    onConsoleLog: () => false,
  },
})
