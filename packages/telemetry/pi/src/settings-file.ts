import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { configFileName } from "./config.ts"

export const packageName = "@latitude-data/pi-telemetry"

export interface PiTelemetryConfigFile {
  apiKey: string
  project: string
  baseUrl?: string | undefined
  enabled: boolean
  debug?: boolean | undefined
  allowConversationAccess: boolean
  tags: string[]
  metadata: Record<string, string>
}

interface PiSettings {
  packages?: Array<string | PiPackageEntry> | undefined
  [key: string]: unknown
}

interface PiPackageEntry {
  source?: string | undefined
  [key: string]: unknown
}

interface PiPaths {
  agentDir: string
  settingsPath: string
  configPath: string
  settingsBackupPath: string
  configBackupPath: string
}

export function pathsForAgentDir(agentDir: string): PiPaths {
  return {
    agentDir,
    settingsPath: join(agentDir, "settings.json"),
    configPath: join(agentDir, configFileName),
    settingsBackupPath: join(agentDir, "settings.json.latitude-bak"),
    configBackupPath: join(agentDir, `${configFileName}.latitude-bak`),
  }
}

export function readSettings(path: string): PiSettings {
  if (!existsSync(path)) return {}
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as PiSettings) : {}
  } catch {
    return {}
  }
}

export function writeSettings(path: string, settings: PiSettings): void {
  writeJsonAtomic(path, settings, 0o644)
}

export function readTelemetryConfig(path: string): Partial<PiTelemetryConfigFile> {
  if (!existsSync(path)) return {}
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Partial<PiTelemetryConfigFile>)
      : {}
  } catch {
    return {}
  }
}

export function writeTelemetryConfig(path: string, config: PiTelemetryConfigFile): void {
  writeJsonAtomic(path, config, 0o600)
}

export function addPackage(settings: PiSettings, source: string): PiSettings {
  const packages = Array.isArray(settings.packages) ? [...settings.packages] : []
  const filtered = packages.filter((entry) => !isLatitudePackageEntry(entry))
  filtered.push(source)
  return { ...settings, packages: filtered }
}

export function removePackage(settings: PiSettings): PiSettings {
  const packages = Array.isArray(settings.packages)
    ? settings.packages.filter((entry) => !isLatitudePackageEntry(entry))
    : []
  return { ...settings, packages }
}

export function hasPackage(settings: PiSettings): boolean {
  return Array.isArray(settings.packages) && settings.packages.some(isLatitudePackageEntry)
}

export function backupIfExists(path: string, backupPath: string): void {
  if (!existsSync(path)) return
  mkdirSync(dirname(backupPath), { recursive: true })
  writeFileSync(backupPath, readFileSync(path))
}

function isLatitudePackageEntry(entry: string | PiPackageEntry): boolean {
  const source = typeof entry === "string" ? entry : entry.source
  if (!source) return false
  return normalizePackageSource(source).startsWith(packageName)
}

function normalizePackageSource(source: string): string {
  return source.startsWith("npm:") ? source.slice("npm:".length) : source
}

function writeJsonAtomic(path: string, value: unknown, mode: number): void {
  mkdirSync(dirname(path), { recursive: true })
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode })
  renameSync(tempPath, path)
}
