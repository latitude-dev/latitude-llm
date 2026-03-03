import { defineConfig, mergeConfig } from "vitest/config"
import base from "@repo/vitest-config"

export default mergeConfig(base, defineConfig({}))
