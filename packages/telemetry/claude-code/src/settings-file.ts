import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export const SETTINGS_PATH = join(homedir(), ".claude", "settings.json")
export const SETTINGS_BACKUP_PATH = join(homedir(), ".claude", "settings.json.latitude-bak")

// Minimal typing of the subset we touch. We preserve every other key verbatim.
export interface ClaudeSettings {
  env?: Record<string, string>
  hooks?: {
    Stop?: HookGroup[]
    SessionEnd?: HookGroup[]
    [other: string]: HookGroup[] | undefined
  }
  [other: string]: unknown
}

export interface HookGroup {
  matcher?: string
  hooks: HookEntry[]
  [other: string]: unknown
}

export interface HookEntry {
  type: string
  command?: string
  async?: boolean
  timeout?: number
  [other: string]: unknown
}

export function readSettings(): ClaudeSettings {
  if (!existsSync(SETTINGS_PATH)) return {}
  const raw = readFileSync(SETTINGS_PATH, "utf-8")
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw) as ClaudeSettings
  } catch (err) {
    throw new Error(`Could not parse ${SETTINGS_PATH}: ${String(err)}. Fix the file and re-run.`)
  }
}

export function backupSettings(): boolean {
  if (!existsSync(SETTINGS_PATH)) return false
  copyFileSync(SETTINGS_PATH, SETTINGS_BACKUP_PATH)
  return true
}

export function writeSettings(settings: ClaudeSettings): void {
  writeFileSync(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`, "utf-8")
}

export function setEnv(settings: ClaudeSettings, key: string, value: string): ClaudeSettings {
  const env = { ...(settings.env ?? {}) }
  env[key] = value
  return { ...settings, env }
}

export function removeEnv(settings: ClaudeSettings, key: string): ClaudeSettings {
  if (!settings.env || !(key in settings.env)) return settings
  const env = { ...settings.env }
  delete env[key]
  const next: ClaudeSettings = { ...settings, env }
  if (Object.keys(env).length === 0) delete (next as { env?: unknown }).env
  return next
}

// Pattern that matches "our" Stop-hook command: either the published package name
// or any dist/index.js inside a claude-code-telemetry folder (dev installs).
function isLatitudeHookCommand(command: string | undefined): boolean {
  if (!command) return false
  if (command.includes("@latitude-data/claude-code-telemetry")) return true
  // dev install inside this repo: packages/telemetry/claude-code/dist/index.js
  if (/telemetry[/\\]claude-code[/\\]dist[/\\]index\.js/.test(command)) return true
  // npm install: node_modules/@latitude-data/claude-code-telemetry/dist/index.js
  if (/claude-code-telemetry[/\\]dist[/\\]index\.js/.test(command)) return true
  return false
}

export function hasLatitudeStopHook(settings: ClaudeSettings): boolean {
  return latitudeStopHookCommand(settings) !== undefined
}

// The command of the first existing Latitude Stop hook, if any — lets the installer
// tell "fresh install" from "upgrade an older command" (e.g. a bare `npx` hook).
export function latitudeStopHookCommand(settings: ClaudeSettings): string | undefined {
  for (const group of settings.hooks?.Stop ?? []) {
    for (const hook of group.hooks ?? []) {
      if (isLatitudeHookCommand(hook.command)) return hook.command
    }
  }
  return undefined
}

// Register the hook on both events Claude Code offers us, because neither covers
// every session on its own.
//
// `Stop` runs after each assistant turn and stays **async**, so an interactive turn
// is never blocked. But Claude Code registers an async Stop hook and then exits
// before spawning it in headless mode, so `claude -p` — how one harness drives
// another — would emit nothing at all.
//
// `SessionEnd` is registered **synchronously** and does fire there, delivering the
// same session_id/transcript_path payload. It also fires on interactive quit and on
// Ctrl-C, which catches a final turn whose async Stop hook died with the process.
// Only SIGKILL escapes both, and nothing can be registered for that.
//
// Emission is incremental behind a byte offset and a state lock, so the two never
// double-count: whichever runs second finds the offset already advanced.
// Claude Code gives all SessionEnd hooks a ~1.5s shared budget and kills them when
// it expires, and a cold `npx` resolve alone can take longer than that — which would
// kill the hook before it reaches detachSelf, putting headless back where it started.
// An explicit per-hook timeout raises the budget; it stays bounded so a wedged hook
// cannot hold session exit open indefinitely.
const SESSION_END_TIMEOUT_SECONDS = 10

export function addLatitudeHooks(
  settings: ClaudeSettings,
  command = "npx -y @latitude-data/claude-code-telemetry@latest",
): ClaudeSettings {
  return {
    ...settings,
    hooks: {
      ...(settings.hooks ?? {}),
      Stop: upsertHook(settings.hooks?.Stop ?? [], command, { async: true }),
      SessionEnd: upsertHook(settings.hooks?.SessionEnd ?? [], command, { timeout: SESSION_END_TIMEOUT_SECONDS }),
    },
  }
}

// Rewrites an existing Latitude hook (an older bare-`npx` command, or a dev dist
// path) rather than appending a second one, so re-running install upgrades in place.
function upsertHook(groups: HookGroup[], command: string, extra: { async?: true; timeout?: number }): HookGroup[] {
  let found = false
  const entry = (): HookEntry => ({ type: "command", command, ...extra })
  const next: HookGroup[] = groups.map((group) => ({
    ...group,
    hooks: (group.hooks ?? []).map((hook) => {
      if (!isLatitudeHookCommand(hook.command)) return hook
      found = true
      // `async` and `timeout` are dropped before re-applying, so a hook written by an
      // older version is corrected rather than left with a stale combination.
      const { async: _priorAsync, timeout: _priorTimeout, ...rest } = hook
      return { ...rest, ...entry() }
    }),
  }))
  if (!found) next.push({ hooks: [entry()] })
  return next
}

export function removeLatitudeHooks(settings: ClaudeSettings): ClaudeSettings {
  if (!settings.hooks) return settings
  const hooks = { ...settings.hooks }
  for (const event of ["Stop", "SessionEnd"] as const) {
    const groups = hooks[event]
    if (!groups) continue
    const kept: HookGroup[] = []
    for (const group of groups) {
      const keptHooks = (group.hooks ?? []).filter((h) => !isLatitudeHookCommand(h.command))
      if (keptHooks.length > 0) kept.push({ ...group, hooks: keptHooks })
    }
    if (kept.length > 0) hooks[event] = kept
    else delete hooks[event]
  }
  const next: ClaudeSettings = { ...settings, hooks }
  if (Object.keys(hooks).length === 0) delete (next as { hooks?: unknown }).hooks
  return next
}
