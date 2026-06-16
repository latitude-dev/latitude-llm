import { cpSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/server.ts", "src/activities/taxonomy-clustering-worker-entry.ts"],
  format: ["cjs"],
  target: "node25",
  outDir: "dist",
  platform: "node",
  deps: {
    alwaysBundle: [/@(platform|domain|repo)\/.*/],
    neverBundle: ["@temporalio/worker", "voyageai", /^@traceloop\//, /^@langchain\//, /^langchain($|\/)/],
  },
  sourcemap: true,
  shims: true,
  clean: true,
  plugins: [
    {
      name: "copy-seed-snapshots",
      closeBundle() {
        const source = resolve("src/seed-snapshots")
        if (existsSync(source)) cpSync(source, resolve("dist/seed-snapshots"), { recursive: true })
      },
    },
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
