import { defineConfig } from "tsdown"

// CLI entry only — this package never gets loaded as an OpenClaw plugin
// (no `openclaw` extensions field in package.json), so there's no scope
// version to bake. The runtime package handles its own SCOPE_VERSION.
export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node20",
  fixedExtension: false,
})
