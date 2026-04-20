import { defineConfig } from "tsup"

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "node20",
    banner: { js: "#!/usr/bin/env node" },
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
  },
])
