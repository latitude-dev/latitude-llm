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
  const groups = settings.hooks?.Stop ?? []
  for (const group of groups) {
    for (const hook of group.hooks ?? []) {
      if (isLatitudeHookCommand(hook.command)) return true
    }
  }
  return false
}

export function addLatitudeStopHook(
  settings: ClaudeSettings,
  command = "npx -y @latitude-data/claude-code-telemetry",
): ClaudeSettings {
  if (hasLatitudeStopHook(settings)) return settings
  const hooks = { ...(settings.hooks ?? {}) }
  const stop = [...(hooks.Stop ?? [])]
  stop.push({
    hooks: [{ type: "command", command, async: true }],
  })
  hooks.Stop = stop
  return { ...settings, hooks }
}

export function removeLatitudeStopHook(settings: ClaudeSettings): ClaudeSettings {
  if (!settings.hooks?.Stop) return settings
  const stop: HookGroup[] = []
  for (const group of settings.hooks.Stop) {
    const keptHooks = (group.hooks ?? []).filter((h) => !isLatitudeHookCommand(h.command))
    if (keptHooks.length > 0) stop.push({ ...group, hooks: keptHooks })
  }
  const hooks = { ...settings.hooks }
  if (stop.length > 0) hooks.Stop = stop
  else delete (hooks as { Stop?: unknown }).Stop
  const next: ClaudeSettings = { ...settings, hooks }
  if (Object.keys(hooks).length === 0) delete (next as { hooks?: unknown }).hooks
  return next
}
