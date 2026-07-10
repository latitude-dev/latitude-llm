import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts", "src/codemode.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node18",
  fixedExtension: false,
  deps: {
    neverBundle: [/^@opentelemetry\//, /^@traceloop\//],
  },
})
