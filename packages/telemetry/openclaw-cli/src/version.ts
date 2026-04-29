import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Read this CLI's own version from its `package.json`. Used by:
 *   - `cli.ts` for `--version`
 *   - `setup.ts` in the npm-registry-404 abort message, so the upgrade
 *     instruction shows the version the user is actually running. Earlier
 *     versions read `process.env.npm_package_version`, but that env var
 *     is only set by `npm run` — not by `npx`, not by globally-installed
 *     bins. The vast majority of `latitude-openclaw` invocations come
 *     through one of those, so the env-var approach printed
 *     `(this version)` instead of the real version every time.
 */
export function readCliVersion(): string {
  // dist/cli.js → ../package.json (after bundling); src/version.ts →
  // ../package.json under vitest's source-mode runner. Both shapes have
  // the package.json one directory up from the entry file.
  const here = dirname(fileURLToPath(import.meta.url))
  const pkgPath = join(here, "..", "package.json")
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string }
    return pkg.version ?? "unknown"
  } catch {
    return "unknown"
  }
}
