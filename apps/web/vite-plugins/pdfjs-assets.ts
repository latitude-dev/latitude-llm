import { cpSync, createReadStream, existsSync, statSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import type { Plugin } from "vite"

// Resolved through @repo/ui, which owns the copy that gets bundled: serving from a second copy would
// 404 every cmap, font and wasm decoder the moment the two versions drifted.
const uiRequire = createRequire(createRequire(import.meta.url).resolve("@repo/ui/package.json"))
const pdfjsDir = path.dirname(uiRequire.resolve("pdfjs-dist/package.json"))
const pdfjsVersion = (uiRequire("pdfjs-dist/package.json") as { version: string }).version

// Keep these air-gapped assets in sync with `documentAssetOptions` in @repo/ui.
const ASSET_DIRS = ["cmaps", "standard_fonts", "wasm", "iccs"] as const

const MOUNT = `/pdfjs/${pdfjsVersion}/`

const MIME_BY_EXTENSION: Record<string, string> = {
  ".bcmap": "application/octet-stream",
  ".icc": "application/vnd.iccprofile",
  ".otf": "font/otf",
  ".pfb": "application/x-font-type1",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
}

export function pdfjsAssets(): Plugin {
  return {
    name: "latitude:pdfjs-assets",
    applyToEnvironment: (environment) => environment.config.consumer === "client",

    configureServer(server) {
      server.middlewares.use(MOUNT, (req, res, next) => {
        const requested = decodeURIComponent((req.url ?? "").split("?")[0] ?? "").replace(/^\//, "")
        const resolved = path.resolve(pdfjsDir, requested)
        const relative = path.relative(pdfjsDir, resolved)
        const isTraversal = relative.startsWith("..") || path.isAbsolute(relative)
        const isKnownDir = ASSET_DIRS.some((dir) => relative === dir || relative.startsWith(`${dir}${path.sep}`))

        if (isTraversal || !isKnownDir || !existsSync(resolved) || !statSync(resolved).isFile()) {
          next()
          return
        }

        res.setHeader("Content-Type", MIME_BY_EXTENSION[path.extname(resolved)] ?? "application/octet-stream")
        createReadStream(resolved).pipe(res)
      })
    },

    writeBundle() {
      const target = path.join(this.environment.config.build.outDir, "pdfjs", pdfjsVersion)
      for (const dir of ASSET_DIRS) {
        cpSync(path.join(pdfjsDir, dir), path.join(target, dir), { recursive: true })
      }
    },
  }
}
