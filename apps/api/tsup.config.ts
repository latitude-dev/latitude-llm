import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["cjs"],
  target: "node25",
  outDir: "dist",
  platform: "node",
  noExternal: [/@(platform|domain|repo)\/.*/],
  splitting: false,
  sourcemap: true,
  clean: true,
  esbuildOptions(options) {
    options.plugins = [
      ...(options.plugins ?? []),
      {
        name: "reject-test-imports",
        setup(build) {
          build.onResolve({ filter: /[\\/](test|testing)[\\/]/ }, (args) => ({
            errors: [
              { text: `Test code must not be bundled in production: ${args.path} (imported from ${args.importer})` },
            ],
          }))
        },
      },
    ]
  },
})
