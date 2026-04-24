import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export const SETTINGS_PATH = join(homedir(), ".openclaw", "openclaw.json")
export const SETTINGS_BACKUP_PATH = join(homedir(), ".openclaw", "openclaw.json.latitude-bak")

export const PLUGIN_ID = "@latitude-data/openclaw-telemetry"

interface OpenClawPluginEntry {
  enabled?: boolean
  hooks?: {
    allowPromptInjection?: boolean
    allowConversationAccess?: boolean
  }
  config?: Record<string, unknown>
}

interface OpenClawSettings {
  plugins?: {
    enabled?: boolean
    entries?: Record<string, OpenClawPluginEntry>
    [key: string]: unknown
  }
  env?: Record<string, string>
  [key: string]: unknown
}

export function readSettings(): OpenClawSettings {
  if (!existsSync(SETTINGS_PATH)) return {}
  try {
    const raw = readFileSync(SETTINGS_PATH, "utf-8")
    const parsed = JSON.parse(raw) as OpenClawSettings
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

export function writeSettings(settings: OpenClawSettings): void {
  writeFileSync(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`, "utf-8")
}

export function backupSettings(): void {
  if (existsSync(SETTINGS_PATH)) copyFileSync(SETTINGS_PATH, SETTINGS_BACKUP_PATH)
}

export function ensurePluginEntry(settings: OpenClawSettings): OpenClawPluginEntry {
  const plugins = settings.plugins ?? {}
  const entries = plugins.entries ?? {}
  const existing = entries[PLUGIN_ID] ?? {}
  const entry: OpenClawPluginEntry = {
    ...existing,
    enabled: true,
    hooks: {
      ...(existing.hooks ?? {}),
      // Required for third-party plugins to read raw conversation content
      // from llm_input/llm_output/agent_end. Without this the hooks fire but
      // payloads are scrubbed — which is exactly the silent failure mode that
      // the existing third-party OpenClaw observability plugin runs into.
      allowConversationAccess: true,
    },
  }
  entries[PLUGIN_ID] = entry
  plugins.entries = entries
  settings.plugins = plugins
  return entry
}

export function removePluginEntry(settings: OpenClawSettings): boolean {
  const plugins = settings.plugins
  if (!plugins?.entries) return false
  if (!(PLUGIN_ID in plugins.entries)) return false
  delete plugins.entries[PLUGIN_ID]
  return true
}

export function setEnv(settings: OpenClawSettings, key: string, value: string): void {
  const env = settings.env ?? {}
  env[key] = value
  settings.env = env
}

export function removeEnv(settings: OpenClawSettings, keys: string[]): boolean {
  const env = settings.env
  if (!env) return false
  let removed = false
  for (const k of keys) {
    if (k in env) {
      delete env[k]
      removed = true
    }
  }
  return removed
}

export function hasLatitudePlugin(settings: OpenClawSettings): boolean {
  return Boolean(settings.plugins?.entries && PLUGIN_ID in settings.plugins.entries)
}
