import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { defineConfig } from "tsdown"

// Read the version at build time and bake it into the bundle as
// `__SCOPE_VERSION__`. Reading `package.json` at runtime via `readFileSync`
// (the pre-0.0.7 approach) tripped OpenClaw 2026.4.26's `plugins.code_safety`
// scanner with a "potential-exfiltration: File read combined with network
// send" warning, because the bundle paired `node:fs.readFileSync` with the
// `fetch` call in `client.ts`. Reading at build time keeps `package.json` as
// the single source of truth for the version while shipping a runtime
// bundle that has zero `node:fs` imports.
const pkgJsonPath = fileURLToPath(new URL("./package.json", import.meta.url))
const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as { version: string }

export default defineConfig({
  entry: ["src/plugin.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node20",
  fixedExtension: false,
  define: {
    __SCOPE_VERSION__: JSON.stringify(pkg.version),
  },
})
