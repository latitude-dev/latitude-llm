import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { isAbsolute, join, resolve as resolvePath } from "node:path"

/**
 * Resolution order for the OpenClaw config directory (the parent of
 * `openclaw.json`):
 *
 *   1. `--openclaw-dir <path>` flag (most explicit; absolute or cwd-relative).
 *   2. `OPENCLAW_HOME` env var (next-most explicit; absolute or cwd-relative).
 *   3. `./openclaw.json` exists in the current working directory → use cwd
 *      (matches `cd into a project that has its own openclaw.json` UX).
 *   4. `~/.openclaw` (default; matches OpenClaw's hardcoded default).
 *
 * The CLI passes `OPENCLAW_HOME=<resolved>` to every spawned `openclaw`
 * subprocess so the runtime side resolves to the same dir we're writing to.
 *
 * Caveat — at the time of writing, OpenClaw's CLI does not advertise
 * `OPENCLAW_HOME` support; the runtime side may still resolve `~/.openclaw`
 * regardless of what we set. The post-install `openclaw config validate
 * --json` step (in `setup.ts`) catches this and restores the backup if the
 * runtime fell back to the wrong dir. Don't trust the resolved path alone —
 * trust the validation result.
 */
export interface ResolvedConfigDir {
  /** Absolute path to the chosen config directory. */
  readonly dir: string
  /** Where the value came from, for logging / debug. */
  readonly source: "flag" | "env" | "cwd" | "default"
}

interface ResolveOptions {
  /** Value of the `--openclaw-dir` flag, if set. */
  readonly flag?: string | undefined
  /** Override `OPENCLAW_HOME` env var (defaults to `process.env.OPENCLAW_HOME`). */
  readonly env?: string | undefined
  /** Override cwd (for tests). Defaults to `process.cwd()`. */
  readonly cwd?: string | undefined
  /** Override home dir (for tests). Defaults to `os.homedir()`. */
  readonly home?: string | undefined
}

export function resolveConfigDir(opts: ResolveOptions = {}): ResolvedConfigDir {
  const cwd = opts.cwd ?? process.cwd()
  const home = opts.home ?? homedir()

  if (typeof opts.flag === "string" && opts.flag.length > 0) {
    return { dir: absolutize(opts.flag, cwd), source: "flag" }
  }
  const envValue = opts.env !== undefined ? opts.env : process.env.OPENCLAW_HOME
  if (typeof envValue === "string" && envValue.length > 0) {
    return { dir: absolutize(envValue, cwd), source: "env" }
  }
  if (existsSync(join(cwd, "openclaw.json"))) {
    return { dir: cwd, source: "cwd" }
  }
  return { dir: join(home, ".openclaw"), source: "default" }
}

function absolutize(p: string, cwd: string): string {
  return isAbsolute(p) ? p : resolvePath(cwd, p)
}

/** Settings paths derived from a config dir. */
export interface SettingsPaths {
  readonly configDir: string
  readonly settingsPath: string
  readonly settingsBackupPath: string
  /** OpenClaw's plugins install record — read-only, used for upgrade-detection. */
  readonly installsPath: string
}

export function pathsFor(configDir: string): SettingsPaths {
  return {
    configDir,
    settingsPath: join(configDir, "openclaw.json"),
    settingsBackupPath: join(configDir, "openclaw.json.latitude-bak"),
    installsPath: join(configDir, "plugins", "installs.json"),
  }
}
