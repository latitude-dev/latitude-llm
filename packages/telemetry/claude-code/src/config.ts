import { parseRedactEnv, type RedactConfig } from "./redaction.ts"

interface Config {
  apiKey: string
  baseUrl: string
  project: string
  enabled: boolean
  debug: boolean
  redact: RedactConfig | undefined
  memory: boolean
  memoryContent: boolean
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiKey = env.LATITUDE_API_KEY ?? ""
  const baseUrl = env.LATITUDE_BASE_URL ?? "https://ingest.latitude.so"
  const project = env.LATITUDE_PROJECT ?? ""
  const enabled = (env.LATITUDE_CLAUDE_CODE_ENABLED ?? "1") !== "0" && apiKey !== "" && project !== ""
  const debug = env.LATITUDE_DEBUG === "1"
  const redact = parseRedactEnv(env)
  const memory = (env.LATITUDE_CLAUDE_CODE_MEMORY ?? "1") !== "0"
  const memoryContent = (env.LATITUDE_CLAUDE_CODE_MEMORY_CONTENT ?? "1") !== "0"
  return { apiKey, baseUrl, project, enabled, debug, redact, memory, memoryContent }
}
