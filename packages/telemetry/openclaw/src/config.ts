export interface Config {
  apiKey: string
  baseUrl: string
  project: string
  enabled: boolean
  debug: boolean
  /**
   * When false, the plugin still emits one span per LLM call / tool / run, but
   * scrubs raw conversation content (input/output messages, system prompt,
   * tool args, tool results, the surfaced first-prompt). Token counts, model
   * names, agent ids, and timings are unaffected.
   */
  allowConversationAccess: boolean
}

const DEFAULT_BASE_URL = "https://ingest.latitude.so"

/**
 * Build a `Config` from OpenClaw's per-plugin config bucket. The plugin SDK
 * passes `api.pluginConfig` (the user's `plugins.entries[id].config` block)
 * to the registration function — that's the only source.
 *
 * Earlier 0.0.x versions also fell back to environment variables when keys
 * were missing from pluginConfig. That fallback is gone deliberately:
 * OpenClaw 2026.4.25's `openclaw plugins install` runs a static-analysis
 * security scan that flags any runtime source combining environment-variable
 * access with a network-send call (we have `fetch(` in postTraces). With
 * the fallback our bundled runtime tripped the scanner. The installer
 * writes credentials to `plugins.entries[id].config` anyway, so the
 * fallback was polish-not-feature — its removal also gives a cleaner
 * privacy story (the runtime can't pick up credentials the operator
 * didn't put in openclaw.json).
 *
 * For dev-time testing with debug logs, set `config.debug = true` in
 * openclaw.json directly.
 */
export function loadConfig(pluginConfig: Record<string, unknown> | undefined = undefined): Config {
  const fromOpts = pluginConfig ?? {}

  const apiKey = pickString(fromOpts.apiKey) ?? ""
  const project = pickString(fromOpts.project) ?? ""
  const baseUrl = pickString(fromOpts.baseUrl) ?? DEFAULT_BASE_URL

  const debug = pickBool(fromOpts.debug) ?? false
  const allowConversationAccess = pickBool(fromOpts.allowConversationAccess) ?? false

  const explicitlyDisabled = pickBool(fromOpts.enabled) === false
  const hasCreds = apiKey !== "" && project !== ""

  return {
    apiKey,
    baseUrl,
    project,
    debug,
    allowConversationAccess,
    enabled: hasCreds && !explicitlyDisabled,
  }
}

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function pickBool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}
