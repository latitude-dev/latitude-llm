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
 * Build a `Config` from OpenClaw's per-plugin config bucket plus environment
 * variables. The plugin SDK passes `api.pluginConfig` (the user's
 * `plugins.entries[id].config` block) to the registration function — that's
 * the primary source. Env vars are kept as a fallback so existing deployments
 * with `LATITUDE_*` already exported in the gateway environment keep working,
 * and so that `LATITUDE_DEBUG=1` can be flipped without editing openclaw.json.
 */
export function loadConfig(
  pluginConfig: Record<string, unknown> | undefined = undefined,
  env: NodeJS.ProcessEnv = process.env,
): Config {
  const fromOpts = pluginConfig ?? {}

  const apiKey = pickString(fromOpts.apiKey) ?? env.LATITUDE_API_KEY ?? ""
  const project = pickString(fromOpts.project) ?? env.LATITUDE_PROJECT ?? ""
  const baseUrl = pickString(fromOpts.baseUrl) ?? env.LATITUDE_BASE_URL ?? DEFAULT_BASE_URL

  const debug = pickBool(fromOpts.debug) ?? env.LATITUDE_DEBUG === "1"
  const allowConversationAccess = pickBool(fromOpts.allowConversationAccess) ?? false

  // Allow either env var or pluginConfig to disable. Falsy `enabled: false` in
  // pluginConfig wins; otherwise we require both api key and project.
  const explicitlyDisabled = pickBool(fromOpts.enabled) === false || (env.LATITUDE_OPENCLAW_ENABLED ?? "1") === "0"
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
