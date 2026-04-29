import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs"

/** Plugin id used both as the npm package name and as the OpenClaw plugin id. */
export const PLUGIN_ID = "@latitude-data/openclaw-telemetry"

/**
 * The shape OpenClaw's strict zod schema accepts for a single
 * `plugins.entries[id]` block. We keep this minimal — only the fields we
 * actually write — so we don't drop anything when round-tripping an entry
 * with fields we don't know about.
 */
interface OpenClawPluginEntry {
  enabled?: boolean
  /**
   * Strict zod object on OpenClaw 2026.4.25+: only `allowPromptInjection` and
   * `allowConversationAccess` are accepted. We populate the latter — it's the
   * dispatch gate the OpenClaw runtime checks before forwarding LLM/tool/agent
   * events to non-bundled plugins. Without it, the gateway logs
   * `[plugins] typed hook "..." blocked because non-bundled plugins must set
   * plugins.entries.<id>.hooks.allowConversationAccess=true` and the plugin's
   * handlers never fire.
   */
  hooks?: {
    allowPromptInjection?: boolean
    allowConversationAccess?: boolean
    [key: string]: unknown
  }
  /**
   * Free-form bucket OpenClaw passes to the plugin at activation
   * (`api.pluginConfig`). Our credentials and feature flags live here.
   */
  config?: Record<string, unknown>
  // Pass through anything else that may already be there — `subagent`, etc.
  [key: string]: unknown
}

export interface OpenClawSettings {
  plugins?: {
    enabled?: boolean
    entries?: Record<string, OpenClawPluginEntry>
    /**
     * Operator-managed allowlist of plugin ids that may auto-load. OpenClaw
     * warns at every gateway start when a non-bundled plugin loads without
     * provenance via `plugins.allow` or an install record.
     */
    allow?: string[]
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

export function readSettings(settingsPath: string): OpenClawSettings {
  if (!existsSync(settingsPath)) return {}
  try {
    const raw = readFileSync(settingsPath, "utf-8")
    const parsed = JSON.parse(raw) as OpenClawSettings
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * Write `openclaw.json` atomically: serialize to a sibling tempfile, then
 * rename over the target. `rename` is atomic on POSIX and effectively atomic
 * on Windows for our case — a crash mid-serialization can no longer leave a
 * truncated `openclaw.json` (combined with `.latitude-bak`, recovery is
 * always possible).
 *
 * Earlier versions used `writeFileSync` directly; that left a corruption
 * window where SIGTERM between `open()` and the final `write()` would leave
 * a partial JSON file the gateway couldn't parse.
 */
export function writeSettings(settingsPath: string, settings: OpenClawSettings): void {
  const tmp = `${settingsPath}.tmp.${process.pid}`
  writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}\n`, "utf-8")
  renameSync(tmp, settingsPath)
}

export function backupSettings(settingsPath: string, backupPath: string): void {
  if (existsSync(settingsPath)) copyFileSync(settingsPath, backupPath)
}

/**
 * Restore the backup over the live settings file. Used when a post-write
 * step (e.g. `openclaw config validate --json`) reports the new file is
 * invalid — better to roll back to a known-good state than leave a broken
 * config that'll fail at gateway-restart time.
 */
export function restoreBackup(settingsPath: string, backupPath: string): boolean {
  if (!existsSync(backupPath)) return false
  copyFileSync(backupPath, settingsPath)
  return true
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
   * `true`/`false` overwrites both `config.allowConversationAccess` AND
   * `hooks.allowConversationAccess` (always coupled — see `setPluginEntry`).
   * `undefined` preserves the existing value, or defaults to `true` for a
   * fresh install.
   */
  allowConversationAccess?: boolean | undefined
  /**
   * `true`/`false` overwrites; `undefined` preserves the existing value (the
   * installer doesn't pass `debug` — it's a hand-edit affordance).
   */
  debug?: boolean | undefined
  /**
   * `true`/`false` overwrites; `undefined` preserves existing, defaulting to
   * `true` for a fresh install. This keeps a paused plugin (`enabled: false`
   * hand-edited in openclaw.json) paused across re-installs.
   */
  enabled?: boolean | undefined
}

/**
 * Set the `plugins.entries[id]` block for our plugin.
 *
 * Two places in the entry get written:
 *
 *   - `.config` (free-form `record(string, unknown)`): credentials, baseUrl,
 *     and our copy of `allowConversationAccess`. This is what the plugin
 *     runtime reads via `api.pluginConfig`.
 *   - `.hooks.allowConversationAccess`: controls whether OpenClaw's hook
 *     dispatcher actually forwards `llm_input` / `llm_output` / tool /
 *     `agent_end` events to our handlers. Without it set to `true` on
 *     OpenClaw 2026.4.25+, every typed hook is blocked at the dispatcher
 *     and the plugin's handlers never fire.
 *
 * The two flags mean different things — `hooks.*` is the dispatch gate,
 * `config.*` is the payload-content gate — but for THIS plugin we always
 * couple them: dispatch off + payload on is useless (no payloads to gate),
 * and dispatch on + payload off is a legitimate "structural-only telemetry"
 * mode (timing, tokens, ids, agent name; no message bodies). Always writing
 * both from the same source keeps the operator's mental model simple.
 *
 * Re-install idempotency: only `apiKey` / `project` / `baseUrl` always
 * overwrite (these come from install prompts). `enabled`, `debug`, and
 * `allowConversationAccess` are preserved when not provided in the patch.
 */
export function setPluginEntry(settings: OpenClawSettings, patch: SetPluginEntryPatch): void {
  const plugins = settings.plugins ?? {}
  const entries = plugins.entries ?? {}
  const existing = entries[PLUGIN_ID] ?? {}
  const existingConfig = (existing.config ?? {}) as Record<string, unknown>
  const existingHooks = existing.hooks ?? {}

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

  // Resolve the effective allowConversationAccess for the hooks block.
  // We mirror whatever ended up in nextConfig.allowConversationAccess (just
  // computed above) so the two flags always agree. If neither the patch nor
  // the existing config sets it, fall back to the existing hooks value, then
  // to `true` (matches the README's first-install promise).
  const effectiveAccess =
    typeof nextConfig.allowConversationAccess === "boolean"
      ? nextConfig.allowConversationAccess
      : typeof existingHooks.allowConversationAccess === "boolean"
        ? existingHooks.allowConversationAccess
        : true

  const nextHooks: OpenClawPluginEntry["hooks"] = {
    ...existingHooks,
    allowConversationAccess: effectiveAccess,
  }

  // Preserve a hand-edited `enabled: false` across re-installs. Fresh install
  // (no existing entry, no explicit patch) defaults to true.
  const nextEnabled = patch.enabled ?? existing.enabled ?? true

  entries[PLUGIN_ID] = {
    ...existing,
    enabled: nextEnabled,
    hooks: nextHooks,
    config: nextConfig,
  }
  plugins.entries = entries
  settings.plugins = plugins
}

/** Remove the plugin entry entirely. Used by uninstall as defense-in-depth. */
export function removePluginEntry(settings: OpenClawSettings): boolean {
  const plugins = settings.plugins
  if (!plugins?.entries) return false
  if (!(PLUGIN_ID in plugins.entries)) return false
  delete plugins.entries[PLUGIN_ID]
  return true
}

/**
 * Add the plugin id to `plugins.allow`. Idempotent — returns `true` only when
 * the array changed. OpenClaw warns at every gateway start when a non-bundled
 * plugin auto-loads without provenance via `plugins.allow` or an install
 * record. We get one warning cleared by going through `openclaw plugins
 * install` (provenance) and the other by adding ourselves to allow.
 *
 * Defensive against hand-edited non-array values: if `plugins.allow` is
 * present but not an array (e.g. someone wrote a string), we replace it
 * with a single-element array rather than spreading the bad value.
 */
export function addToPluginsAllow(settings: OpenClawSettings): boolean {
  const plugins = settings.plugins ?? {}
  const existing = plugins.allow
  const allow = Array.isArray(existing) ? existing : []
  if (allow.includes(PLUGIN_ID)) return false
  plugins.allow = [...allow, PLUGIN_ID]
  settings.plugins = plugins
  return true
}

/**
 * Inverse of `addToPluginsAllow`. Defense-in-depth — `openclaw plugins
 * uninstall` already strips the entry, but the install path can be skipped
 * (e.g. the user removed the plugin manually) and we want re-install/uninstall
 * round-trips to be tidy regardless.
 */
export function removeFromPluginsAllow(settings: OpenClawSettings): boolean {
  const allow = settings.plugins?.allow
  if (!Array.isArray(allow) || !allow.includes(PLUGIN_ID)) return false
  if (settings.plugins) {
    settings.plugins.allow = allow.filter((id) => id !== PLUGIN_ID)
  }
  return true
}

export function hasLatitudePlugin(settings: OpenClawSettings): boolean {
  return Boolean(settings.plugins?.entries && PLUGIN_ID in settings.plugins.entries)
}

/**
 * Strip leftover keys from older installers that the strict zod schema
 * rejects on current OpenClaw versions.
 *
 * 0.0.1 wrote `LATITUDE_*` keys directly under `settings.env`. OpenClaw's
 * root schema is strict; the `env` block accepts only `{shellEnv, vars}`,
 * so those keys cause the gateway to quarantine the config as
 * `clobbered.<ts>` and roll back. We sweep them on every install.
 *
 * Note: 0.0.1 also wrote `hooks.allowConversationAccess` (when that key was
 * not yet in the schema). We deliberately do NOT strip it anymore — on
 * OpenClaw 2026.4.25+ the key IS in the schema and IS load-bearing for
 * dispatch. `setPluginEntry` overwrites it on every install with the right
 * value, so any 0.0.1 leftover is reconciled there.
 */
export function migrateLegacyEntries(settings: OpenClawSettings): { changed: boolean } {
  let changed = false

  const env = settings.env
  if (env && typeof env === "object" && !Array.isArray(env)) {
    const envObj = env as Record<string, unknown>
    for (const key of ["LATITUDE_API_KEY", "LATITUDE_PROJECT", "LATITUDE_BASE_URL"]) {
      if (key in envObj) {
        delete envObj[key]
        changed = true
      }
    }
    // Drop the env object only if it's now empty; don't touch a real
    // OpenClaw env block (`{shellEnv, vars}`) that already had those keys.
    if (Object.keys(envObj).length === 0) {
      delete settings.env
    }
  }

  return { changed }
}

/**
 * Read OpenClaw's plugins install record (`<configDir>/plugins/installs.json`)
 * and return the version recorded for our plugin id, if any. Used by the
 * install flow to render `Upgrading 0.0.6 → 0.0.7` UX.
 *
 * Best-effort: returns undefined on any read/parse error, on missing file,
 * on schemas we don't recognize. Callers must handle the undefined case
 * (typically by rendering a "fresh install" path).
 */
export function readInstalledRuntimeVersion(installsPath: string): string | undefined {
  if (!existsSync(installsPath)) return undefined
  try {
    const raw = readFileSync(installsPath, "utf-8")
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined
    const entries = (parsed as { entries?: Record<string, unknown> }).entries
    if (!entries || typeof entries !== "object") return undefined
    const ours = entries[PLUGIN_ID]
    if (!ours || typeof ours !== "object") return undefined
    const version = (ours as { version?: unknown }).version
    return typeof version === "string" ? version : undefined
  } catch {
    return undefined
  }
}
