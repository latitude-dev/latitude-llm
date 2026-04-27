import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { PLUGIN_INSTALL_DIR } from "./settings-file.ts"

/**
 * Copies the plugin's runtime files into `~/.openclaw/extensions/latitude-telemetry/`
 * so OpenClaw's discovery (`<configDir>/extensions/<plugin>`) picks it up.
 *
 * `npx -y @latitude-data/openclaw-telemetry` runs the CLI from a temporary npm
 * location — relying on that path persisting across runs (or even across the
 * gateway restart that follows install) is unsafe. So we materialize a stable
 * copy under the user's OpenClaw config dir, the same path OpenClaw scans on
 * startup. Layout we produce:
 *
 *   ~/.openclaw/extensions/latitude-telemetry/
 *     openclaw.plugin.json   <- the manifest, required by discovery
 *     package.json           <- minimal — keeps node module-resolution happy
 *     dist/                  <- compiled plugin entrypoint(s)
 */
export function installPluginFiles(): { destination: string; entryPath: string } {
  // The CLI runs from `dist/cli.js`. Resolve the package root from there.
  const here = dirname(fileURLToPath(import.meta.url))
  const packageRoot = resolve(here, "..") // dist/cli.js -> dist/ -> package root

  const manifestSrc = join(packageRoot, "openclaw.plugin.json")
  const distSrc = join(packageRoot, "dist")
  const pkgSrc = join(packageRoot, "package.json")

  if (!existsSync(manifestSrc)) {
    throw new Error(
      `Cannot install: missing openclaw.plugin.json at ${manifestSrc}. This is a packaging bug — please file an issue.`,
    )
  }
  if (!existsSync(distSrc)) {
    throw new Error(`Cannot install: missing compiled dist at ${distSrc}.`)
  }

  // Wipe and recreate so a re-install isn't polluted by a previous version's
  // files. Idempotent.
  if (existsSync(PLUGIN_INSTALL_DIR)) rmSync(PLUGIN_INSTALL_DIR, { recursive: true, force: true })
  mkdirSync(PLUGIN_INSTALL_DIR, { recursive: true })

  copyFileSync(manifestSrc, join(PLUGIN_INSTALL_DIR, "openclaw.plugin.json"))
  cpSync(distSrc, join(PLUGIN_INSTALL_DIR, "dist"), { recursive: true })

  // Write a minimal package.json. Three fields matter for OpenClaw:
  //   - `name`/`version` for diagnostics.
  //   - `type: "module"` so node treats `dist/plugin.js` as ESM.
  //   - `openclaw.extensions: [...]` — THIS is what OpenClaw's plugin
  //     discovery uses to find the plugin entry file. The
  //     `openclaw.plugin.json` manifest provides id + configSchema, but
  //     discovery's `resolvePackageExtensionEntries` reads
  //     `package.json["openclaw"].extensions`. Without this, discovery
  //     falls through to looking for `index.{ts,js,mjs,cjs}` at the dir
  //     root, doesn't find one, and skips us — which manifests as
  //     "plugin not found" at gateway start.
  if (existsSync(pkgSrc)) {
    const sourcePkg = JSON.parse(readFileSync(pkgSrc, "utf-8")) as {
      name?: string
      version?: string
      type?: string
      main?: string
      openclaw?: { extensions?: string[] }
    }
    const extensions = sourcePkg.openclaw?.extensions ?? ["./dist/plugin.js"]
    const minimalPkg = {
      name: sourcePkg.name,
      version: sourcePkg.version,
      type: sourcePkg.type ?? "module",
      main: sourcePkg.main ?? "./dist/plugin.js",
      private: true,
      openclaw: { extensions },
    }
    writeFileSync(join(PLUGIN_INSTALL_DIR, "package.json"), `${JSON.stringify(minimalPkg, null, 2)}\n`, "utf-8")
  }

  return {
    destination: PLUGIN_INSTALL_DIR,
    entryPath: join(PLUGIN_INSTALL_DIR, "dist", "plugin.js"),
  }
}

/** Remove the materialized plugin directory under `~/.openclaw/extensions/`. */
export function removePluginFiles(): boolean {
  if (!existsSync(PLUGIN_INSTALL_DIR)) return false
  rmSync(PLUGIN_INSTALL_DIR, { recursive: true, force: true })
  return true
}
