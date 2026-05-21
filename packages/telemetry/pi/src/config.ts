import { execSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { hostname, userInfo } from "node:os"
import { join } from "node:path"
import type { RuntimeConfig, UserIdentity } from "./types.ts"

export const configFileName = "latitude-telemetry.json"

interface FileConfig {
  apiKey?: string | undefined
  project?: string | undefined
  baseUrl?: string | undefined
  enabled?: boolean | undefined
  debug?: boolean | undefined
  allowConversationAccess?: boolean | undefined
  tags?: string[] | undefined
  metadata?: Record<string, string> | undefined
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const agentDir = resolvePiAgentDir(env)
  const file = readFileConfig(join(agentDir, configFileName))

  const apiKey = env.LATITUDE_API_KEY ?? file.apiKey ?? ""
  const project = env.LATITUDE_PROJECT ?? env.LATITUDE_PROJECT_SLUG ?? file.project ?? ""
  const baseUrl = env.LATITUDE_BASE_URL ?? file.baseUrl ?? "https://ingest.latitude.so"
  const debug = env.LATITUDE_DEBUG === "1" || env.LATITUDE_DEBUG === "true" || file.debug === true
  const allowConversationAccess = resolveAllowConversationAccess(env, file)
  const explicitEnabled = env.LATITUDE_PI_TELEMETRY_ENABLED ?? env.LATITUDE_TELEMETRY_ENABLED
  const enabledByFlag =
    explicitEnabled === undefined ? file.enabled !== false : !["0", "false", "no"].includes(explicitEnabled)
  const enabled = enabledByFlag && apiKey !== "" && project !== ""
  const configSource =
    env.LATITUDE_API_KEY || env.LATITUDE_PROJECT || env.LATITUDE_PROJECT_SLUG
      ? "env"
      : file.apiKey || file.project
        ? "file"
        : "none"

  return {
    apiKey,
    project,
    baseUrl,
    enabled,
    debug,
    allowConversationAccess,
    tags: file.tags ?? ["pi"],
    metadata: file.metadata ?? {},
    configSource,
  }
}

export function resolvePiAgentDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.PI_CODING_AGENT_DIR) return expandHome(env.PI_CODING_AGENT_DIR)
  return join(userInfo().homedir, ".pi", "agent")
}

export function resolveIdentity(env: NodeJS.ProcessEnv = process.env): UserIdentity {
  const email = env.LATITUDE_PI_USER_EMAIL ?? env.PI_OTEL_USER_EMAIL ?? gitConfig("user.email")
  const fullName = env.LATITUDE_PI_USER_NAME ?? env.PI_OTEL_USER_NAME ?? gitConfig("user.name")
  const userName = userInfo().username
  const userId = env.LATITUDE_PI_USER_ID ?? email ?? userName

  return {
    userId,
    userName,
    fullName: fullName ?? "",
    email: email ?? "",
    hostName: hostname(),
  }
}

function resolveAllowConversationAccess(env: NodeJS.ProcessEnv, file: FileConfig): boolean {
  const explicit = env.LATITUDE_PI_ALLOW_CONVERSATION_ACCESS ?? env.LATITUDE_ALLOW_CONVERSATION_ACCESS
  if (explicit !== undefined) return ["1", "true", "yes"].includes(explicit)
  const noContent = env.LATITUDE_PI_NO_CONTENT ?? env.LATITUDE_NO_CONTENT
  if (noContent !== undefined) return !["1", "true", "yes"].includes(noContent)
  return file.allowConversationAccess ?? true
}

function readFileConfig(path: string): FileConfig {
  if (!existsSync(path)) return {}
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown
    if (!parsed || typeof parsed !== "object") return {}
    const obj = parsed as Record<string, unknown>
    return {
      apiKey: stringValue(obj.apiKey),
      project: stringValue(obj.project),
      baseUrl: stringValue(obj.baseUrl),
      enabled: booleanValue(obj.enabled),
      debug: booleanValue(obj.debug),
      allowConversationAccess: booleanValue(obj.allowConversationAccess),
      tags: stringArrayValue(obj.tags),
      metadata: stringRecordValue(obj.metadata),
    }
  } catch {
    return {}
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function stringArrayValue(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined
}

function stringRecordValue(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const out: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") out[key] = item
    else if (typeof item === "number" || typeof item === "boolean") out[key] = String(item)
  }
  return out
}

function gitConfig(key: string): string | undefined {
  try {
    const value = execSync(`git config --global ${key}`, { encoding: "utf8", timeout: 2_000 }).trim()
    return value === "" ? undefined : value
  } catch {
    return undefined
  }
}

function expandHome(path: string): string {
  if (path === "~") return userInfo().homedir
  if (path.startsWith("~/")) return join(userInfo().homedir, path.slice(2))
  return path
}
