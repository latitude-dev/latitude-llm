import path from "node:path"
import { fileURLToPath } from "node:url"
import { cloudflare } from "@cloudflare/vite-plugin"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const telemetryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

export default defineConfig({
  plugins: [react(), cloudflare()],
  resolve: {
    alias: {
      "@latitude-data/telemetry/cloudflare": path.join(telemetryRoot, "dist/cloudflare/index.js"),
      "@latitude-data/telemetry": path.join(telemetryRoot, "dist/index.js"),
    },
  },
})
