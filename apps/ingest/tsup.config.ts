import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["cjs"],
  target: "node20",
  outDir: "dist",
  platform: "node",
  noExternal: [/@(platform|domain|repo)\/.*/], // Only bundle workspace packages
  splitting: false,
  sourcemap: true,
  clean: true,
})
