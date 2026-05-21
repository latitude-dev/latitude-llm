import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { defineConfig } from "tsdown"

const pkgJsonPath = fileURLToPath(new URL("./package.json", import.meta.url))
const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as { version: string }

const define = {
  __PACKAGE_VERSION__: JSON.stringify(pkg.version),
}

export default defineConfig([
  {
    entry: ["src/extension.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "node20",
    fixedExtension: false,
    define,
  },
  {
    entry: ["src/cli.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: false,
    target: "node20",
    fixedExtension: false,
    banner: { js: "#!/usr/bin/env node" },
    define,
  },
])
