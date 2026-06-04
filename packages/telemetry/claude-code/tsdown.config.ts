import { defineConfig } from "tsdown"

export default defineConfig([
  {
    // Bin entry: version-checks before dynamically loading index.ts.
    entry: ["src/entry.ts"],
    format: ["esm"],
    dts: false,
    sourcemap: true,
    clean: true,
    target: "node20",
    fixedExtension: false,
    banner: { js: "#!/usr/bin/env node" },
  },
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: false,
    target: "node20",
    fixedExtension: false,
  },
  {
    // The intercept runs as a Bun --preload inside the claude process, so it must
    // be self-contained and standalone — no shebang, no external imports.
    entry: ["src/intercept.ts"],
    format: ["esm"],
    dts: false,
    sourcemap: true,
    clean: false,
    target: "node20",
    fixedExtension: false,
  },
])
