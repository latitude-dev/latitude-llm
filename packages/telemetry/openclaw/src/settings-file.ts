import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const CONFIG_DIR = join(homedir(), ".openclaw")
export const SETTINGS_PATH = join(CONFIG_DIR, "openclaw.json")
export const SETTINGS_BACKUP_PATH = join(CONFIG_DIR, "openclaw.json.latitude-bak")
const EXTENSIONS_DIR = join(CONFIG_DIR, "extensions")
export const PLUGIN_INSTALL_DIR = join(EXTENSIONS_DIR, "latitude-telemetry")

/** Plugin id used both as the npm package name and as the OpenClaw plugin id. */
export const PLUGIN_ID = "@latitude-data/openclaw-telemetry"

/**
 * The shape OpenClaw's strict zod schema accepts for a single
 * `plugins.entries[id]` block. We deliberately keep this minimal — only the
 * fields we actually write — so we don't drop anything when round-tripping
 * an existing entry that uses fields we don't know about.
 */
interface OpenClawPluginEntry {
  enabled?: boolean
  /**
   * The free-form bucket OpenClaw passes to the plugin at activation. This is
   * where we store all our credentials and feature flags — `hooks` is strict,
   * `env` at root is not a free-form key/value passthrough, and using
   * `.config` keeps everything namespaced to our plugin and survives any
   * version of OpenClaw because the field is a `record(string, unknown)`.
   */
  config?: Record<string, unknown>
  // Pass through anything else that may already be there — `hooks`, `subagent`, etc.
  [key: string]: unknown
}

export interface OpenClawSettings {
  plugins?: {
    enabled?: boolean
    entries?: Record<string, OpenClawPluginEntry>
    load?: { paths?: string[] }
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface LatitudePluginConfig {
  apiKey: string
  project: string
  baseUrl?: string | undefined
  allowConversationAccess?: boolean | undefined
  debug?: boolean | undefined
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

interface SetPluginEntryPatch {
  /** New API key. Always overwrites — comes from the install prompt. */
  apiKey: string
  /** New project slug. Always overwrites — comes from the install prompt. */
  project: string
  /**
   * New `baseUrl`. `undefined` clears any existing override (used when
   * installing back to production). Anything else overwrites.
   */
  baseUrl: string | undefined
  /**
   * `true`/`false` overwrites; `undefined` preserves the existing value (or
   * leaves the key absent if there is none).
   */
  allowConversationAccess?: boolean | undefined
  /** Same semantics as `allowConversationAccess`. */
  debug?: boolean | undefined
  /**
   * `true`/`false` overwrites; `undefined` preserves the existing value, or
   * defaults to `true` for a fresh install. This keeps a paused plugin
   * (`enabled: false` in openclaw.json) paused across re-installs.
   */
  enabled?: boolean | undefined
}

/**
 * Set the `plugins.entries[id]` block for our plugin. Writes credentials and
 * options into the `.config` bucket — never under `hooks` (strict zod) and
 * never as top-level `env` keys (root schema rejects them).
 *
 * Re-install idempotency: only `apiKey` / `project` / `baseUrl` always
 * overwrite (these come from the install prompts). `enabled`, `debug`, and
 * `allowConversationAccess` are preserved when not provided in the patch,
 * so a user who hand-edited `enabled: false` or `debug: true` doesn't lose
 * their choice on a re-install.
 */
export function setPluginEntry(settings: OpenClawSettings, patch: SetPluginEntryPatch): void {
  const plugins = settings.plugins ?? {}
  const entries = plugins.entries ?? {}
  const existing = entries[PLUGIN_ID] ?? {}
  const existingConfig = (existing.config ?? {}) as Record<string, unknown>

  const nextConfig: Record<string, unknown> = {
    ...existingConfig,
    apiKey: patch.apiKey,
    project: patch.project,
  }
  if (patch.baseUrl !== undefined) {
    nextConfig.baseUrl = patch.baseUrl
  } else {
    delete nextConfig.baseUrl
  }
  if (patch.allowConversationAccess !== undefined) {
    nextConfig.allowConversationAccess = patch.allowConversationAccess
  }
  if (patch.debug !== undefined) {
    nextConfig.debug = patch.debug
  }

  // Preserve user-edited `enabled: false` across re-installs. Fresh install
  // (no existing entry, no explicit patch) defaults to true.
  const nextEnabled = patch.enabled ?? existing.enabled ?? true

  entries[PLUGIN_ID] = {
    ...existing,
    enabled: nextEnabled,
    config: nextConfig,
  }
  plugins.entries = entries
  settings.plugins = plugins
}

/** Remove the plugin entry entirely. */
export function removePluginEntry(settings: OpenClawSettings): boolean {
  const plugins = settings.plugins
  if (!plugins?.entries) return false
  if (!(PLUGIN_ID in plugins.entries)) return false
  delete plugins.entries[PLUGIN_ID]
  return true
}

export function hasLatitudePlugin(settings: OpenClawSettings): boolean {
  return Boolean(settings.plugins?.entries && PLUGIN_ID in settings.plugins.entries)
}

/**
 * Strip any leftover top-level keys our older installer (<= 0.0.1) wrote. The
 * 0.0.1 installer wrote `hooks.allowConversationAccess` (rejected by strict
 * zod) and `LATITUDE_*` keys at root-level `env` (also rejected). Both are
 * cleaned up here so re-running install lands a config OpenClaw will validate.
 */
export function migrateLegacyEntries(settings: OpenClawSettings): { changed: boolean } {
  let changed = false

  // Wipe `hooks.allowConversationAccess` from our entry — OpenClaw < 2026.4.22
  // rejects unknown keys under the strict `hooks` shape.
  const entry = settings.plugins?.entries?.[PLUGIN_ID]
  if (entry && typeof entry === "object") {
    const hooks = (entry as { hooks?: Record<string, unknown> }).hooks
    if (hooks && typeof hooks === "object" && "allowConversationAccess" in hooks) {
      delete hooks.allowConversationAccess
      // If the hooks object is now empty, drop it entirely so we don't leave
      // a `"hooks": {}` carcass behind.
      if (Object.keys(hooks).length === 0) {
        delete (entry as { hooks?: unknown }).hooks
      }
      changed = true
    }
  }

  // Strip `LATITUDE_*` keys our 0.0.1 installer mistakenly wrote under
  // `settings.env`. OpenClaw's root schema is strict; the `env` block accepts
  // only `{shellEnv, vars}`, so any `LATITUDE_*` key sitting directly under
  // `env` causes the gateway to quarantine the file. (0.0.1 only ever wrote
  // to `settings.env.LATITUDE_*`, never to top-level `settings.LATITUDE_*`,
  // so we don't bother sweeping the root.)
  const env = settings.env
  if (env && typeof env === "object" && !Array.isArray(env)) {
    const envObj = env as Record<string, unknown>
    for (const key of ["LATITUDE_API_KEY", "LATITUDE_PROJECT", "LATITUDE_BASE_URL"]) {
      if (key in envObj) {
        delete envObj[key]
        changed = true
      }
    }
    // Drop the env object if there's nothing left in it AND it's not OpenClaw's
    // canonical {shellEnv, vars} shape — only do this when we know it was ours.
    if (Object.keys(envObj).length === 0) {
      delete settings.env
    }
  }

  return { changed }
}
