import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["cjs"],
  target: "node25",
  outDir: "dist",
  platform: "node",
  deps: {
    alwaysBundle: [/@(platform|domain|repo)\/.*/],
    neverBundle: ["@temporalio/worker", /^@traceloop\//, /^@langchain\//, /^langchain($|\/)/],
  },
  sourcemap: true,
  shims: true,
  clean: true,
  plugins: [
    {
      name: "reject-test-imports",
      resolveId(source, importer) {
        if (/[\\/](test|testing)[\\/]/.test(source)) {
          this.error(
            `Test code must not be bundled in production: ${source} (imported from ${importer ?? "<unknown>"})`,
          )
        }
        return null
      },
    },
  ],
})
