import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/plugin.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node20",
  fixedExtension: false,
})
