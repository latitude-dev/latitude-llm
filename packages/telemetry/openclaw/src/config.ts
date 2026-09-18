import { parseRedactConfig, type RedactConfig } from "./redaction.ts"

export interface Config {
  apiKey: string
  baseUrl: string
  project: string
  enabled: boolean
  debug: boolean
  /**
   * When false, the plugin still emits one span per LLM call / tool / run, but
   * scrubs raw conversation content (input/output messages, system prompt,
   * tool args, tool results, memory bodies). Token counts, model names, agent
   * ids, and timings are unaffected.
   */
  allowConversationAccess: boolean
  redact?: RedactConfig | undefined
  serviceName: string
  tags: string[]
  metadata: Record<string, string>
  memory: boolean
  memoryContent: boolean
  toolDefinitions: boolean
  maxContentChars: number
}

const DEFAULT_BASE_URL = "https://ingest.latitude.so"
const DEFAULT_SERVICE_NAME = "openclaw"
const DEFAULT_MAX_CONTENT_CHARS = 262_144

/**
 * Build a `Config` from OpenClaw's per-plugin config bucket. The plugin SDK
 * passes `api.pluginConfig` (the user's `plugins.entries[id].config` block)
 * to the registration function; that is the only source. There is no
 * environment fallback: the runtime must not combine env reads with the
 * network send, and the installer always writes credentials here.
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
    redact: parseRedactConfig(fromOpts.redact),
    enabled: hasCreds && !explicitlyDisabled,
    serviceName: pickString(fromOpts.serviceName) ?? DEFAULT_SERVICE_NAME,
    tags: pickStringList(fromOpts.tags),
    metadata: pickStringMap(fromOpts.metadata),
    memory: pickBool(fromOpts.memory) ?? true,
    memoryContent: pickBool(fromOpts.memoryContent) ?? true,
    toolDefinitions: pickBool(fromOpts.toolDefinitions) ?? true,
    maxContentChars: pickPositiveInt(fromOpts.maxContentChars) ?? DEFAULT_MAX_CONTENT_CHARS,
  }
}

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function pickBool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function pickPositiveInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined
}

function pickStringList(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  }
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim())
}

function pickStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v
    else if (typeof v === "number" || typeof v === "boolean") out[k] = String(v)
  }
  return out
}
