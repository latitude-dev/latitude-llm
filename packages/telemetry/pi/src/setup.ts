import { existsSync, rmSync } from "node:fs"
import { cancel, intro, isCancel, log, note, outro, password, text } from "@clack/prompts"
import pc from "picocolors"
import { resolvePiAgentDir } from "./config.ts"
import {
  addPackage,
  backupIfExists,
  hasPackage,
  type PiTelemetryConfigFile,
  packageName,
  pathsForAgentDir,
  readSettings,
  readTelemetryConfig,
  removePackage,
  writeSettings,
  writeTelemetryConfig,
} from "./settings-file.ts"
import { packageVersion } from "./version.ts"

const docsUrl = "https://docs.latitude.so/telemetry/pi-coding-agent"

interface EnvironmentConfig {
  name: "production" | "staging" | "dev"
  label: string
  app: string
  ingest: string
}

const productionEnv: EnvironmentConfig = {
  name: "production",
  label: "production",
  app: "https://console.latitude.so",
  ingest: "https://ingest.latitude.so",
}

const stagingEnv: EnvironmentConfig = {
  name: "staging",
  label: "staging",
  app: "https://staging.latitude.so",
  ingest: "https://staging-ingest.latitude.so",
}

const devEnv: EnvironmentConfig = {
  name: "dev",
  label: "local dev",
  app: "http://localhost:3000",
  ingest: "http://localhost:3002",
}

interface InstallFlags {
  apiKey?: string | undefined
  project?: string | undefined
  baseUrl?: string | undefined
  environment?: EnvironmentConfig | undefined
  allowConversationAccess?: boolean | undefined
  piDir?: string | undefined
  dryRun?: boolean | undefined
  noPrompt?: boolean | undefined
}

interface UninstallFlags {
  piDir?: string | undefined
  noPrompt?: boolean | undefined
}

const valueFlags = new Set(["api-key", "project", "base-url", "pi-dir"])

export function parseFlags(argv: string[]): {
  subcommand: string | undefined
  flags: Record<string, string | boolean>
} {
  const [subcommand, ...rest] = argv
  const flags: Record<string, string | boolean> = {}
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (!arg?.startsWith("--")) continue
    const eq = arg.indexOf("=")
    if (eq >= 0) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1)
      continue
    }
    const key = arg.slice(2)
    const next = rest[i + 1]
    if (valueFlags.has(key) && next !== undefined && !next.startsWith("--")) {
      flags[key] = next
      i += 1
    } else {
      flags[key] = true
    }
  }
  return { subcommand, flags }
}

export function normalizeInstallFlags(flags: Record<string, string | boolean>): InstallFlags {
  let environment: EnvironmentConfig | undefined
  if (flags.staging === true) environment = stagingEnv
  if (flags.dev === true) {
    if (environment) throw new Error("--staging and --dev are mutually exclusive")
    environment = devEnv
  }

  let allowConversationAccess: boolean | undefined
  if (flags["no-content"] === true || flags["no-conversation"] === true) allowConversationAccess = false
  if (flags["allow-conversation"] === true) allowConversationAccess = true

  return {
    apiKey: typeof flags["api-key"] === "string" ? flags["api-key"] : undefined,
    project: typeof flags.project === "string" ? flags.project : undefined,
    baseUrl: typeof flags["base-url"] === "string" ? flags["base-url"] : undefined,
    environment,
    allowConversationAccess,
    piDir: typeof flags["pi-dir"] === "string" ? flags["pi-dir"] : undefined,
    dryRun: flags["dry-run"] === true,
    noPrompt: flags.yes === true || flags["no-prompt"] === true,
  }
}

export function normalizeUninstallFlags(flags: Record<string, string | boolean>): UninstallFlags {
  return {
    piDir: typeof flags["pi-dir"] === "string" ? flags["pi-dir"] : undefined,
    noPrompt: flags.yes === true || flags["no-prompt"] === true,
  }
}

export async function runInstall(flags: InstallFlags = {}): Promise<void> {
  const canPrompt = !flags.noPrompt && process.stdin.isTTY === true
  if (canPrompt) {
    await runInteractiveInstall(flags)
    return
  }
  await runFlagDrivenInstall(flags)
}

async function runInteractiveInstall(flags: InstallFlags): Promise<void> {
  intro(pc.bgCyan(pc.black(" Latitude · pi telemetry ")))

  const env = flags.environment ?? productionEnv
  const paths = pathsForAgentDir(resolvePiAgentDirFromFlags(flags))
  const existing = readTelemetryConfig(paths.configPath)

  note(
    [
      "Captures pi coding agent prompts, model turns, tool calls,",
      "token usage, prompts/responses, and tool I/O as Latitude traces.",
      "",
      `${pc.dim("Docs")} ${pc.cyan(docsUrl)}`,
      env.name === "production" ? undefined : pc.yellow(`Using ${env.label} ingest (${env.ingest})`),
    ]
      .filter((line): line is string => line !== undefined)
      .join("\n"),
    "About",
  )

  log.info(`Using pi config dir: ${pc.dim(paths.agentDir)}`)
  log.info(`Create an API key at ${pc.cyan(`${env.app}/settings/api-keys`)}`)

  const apiKey = await promptApiKey(flags.apiKey ?? existing.apiKey)
  const project = await promptProject(flags.project ?? existing.project)
  const allowConversationAccess = flags.allowConversationAccess ?? existing.allowConversationAccess ?? true

  applyInstall({
    paths,
    apiKey,
    project,
    baseUrl: flags.baseUrl ?? (env.name === "production" ? undefined : env.ingest),
    allowConversationAccess,
    dryRun: flags.dryRun === true,
  })

  note(
    [
      flags.dryRun ? "Dry-run only — nothing was written." : "Installed. Restart pi so it can load the package.",
      `Traces will be sent to project ${pc.cyan(project)}.`,
    ].join("\n"),
    "Next step",
  )
  outro(flags.dryRun ? pc.dim("(dry-run)") : pc.green("✓ Installed"))
}

async function runFlagDrivenInstall(flags: InstallFlags): Promise<void> {
  const paths = pathsForAgentDir(resolvePiAgentDirFromFlags(flags))
  const existing = readTelemetryConfig(paths.configPath)
  const env = flags.environment ?? productionEnv
  const apiKey = flags.apiKey ?? existing.apiKey
  const project = flags.project ?? existing.project
  if (!apiKey || !project) {
    throw new Error("Non-interactive install requires --api-key=... and --project=... (or run in a TTY).")
  }

  applyInstall({
    paths,
    apiKey,
    project,
    baseUrl: flags.baseUrl ?? existing.baseUrl ?? (env.name === "production" ? undefined : env.ingest),
    allowConversationAccess: flags.allowConversationAccess ?? existing.allowConversationAccess ?? true,
    dryRun: flags.dryRun === true,
  })

  if (flags.dryRun) {
    process.stdout.write("Dry-run only — nothing was written.\n")
  } else {
    process.stdout.write(
      `Installed Latitude pi telemetry in ${paths.agentDir}. Restart pi so it can load the package.\n`,
    )
  }
}

function applyInstall({
  paths,
  apiKey,
  project,
  baseUrl,
  allowConversationAccess,
  dryRun,
}: {
  paths: ReturnType<typeof pathsForAgentDir>
  apiKey: string
  project: string
  baseUrl?: string | undefined
  allowConversationAccess: boolean
  dryRun: boolean
}): void {
  const settingsBefore = readSettings(paths.settingsPath)
  const settingsAfter = addPackage(settingsBefore, `npm:${packageName}@${packageVersion}`)
  const existingConfig = readTelemetryConfig(paths.configPath)
  const config: PiTelemetryConfigFile = {
    apiKey,
    project,
    ...(baseUrl ? { baseUrl } : {}),
    enabled: true,
    debug: existingConfig.debug ?? false,
    allowConversationAccess,
    tags: existingConfig.tags ?? ["pi"],
    metadata: existingConfig.metadata ?? {},
  }

  if (dryRun) {
    process.stdout.write(
      `${JSON.stringify(
        {
          settingsPath: paths.settingsPath,
          configPath: paths.configPath,
          settingsAfter,
          config: { ...config, apiKey: config.apiKey ? "<redacted>" : "" },
        },
        null,
        2,
      )}\n`,
    )
    return
  }

  backupIfExists(paths.settingsPath, paths.settingsBackupPath)
  backupIfExists(paths.configPath, paths.configBackupPath)
  writeSettings(paths.settingsPath, settingsAfter)
  writeTelemetryConfig(paths.configPath, config)
}

export async function runUninstall(flags: UninstallFlags = {}): Promise<void> {
  const paths = pathsForAgentDir(resolvePiAgentDirFromFlags(flags))
  const settingsBefore = readSettings(paths.settingsPath)
  const installed = hasPackage(settingsBefore)
  if (!installed && !existsSync(paths.configPath)) {
    process.stdout.write("Latitude pi telemetry is not installed.\n")
    return
  }

  if (!flags.noPrompt && process.stdin.isTTY === true) {
    intro(pc.bgYellow(pc.black(" Latitude · pi telemetry — uninstall ")))
    const confirmed = await text({
      message: "Type uninstall to remove Latitude pi telemetry",
      placeholder: "uninstall",
    })
    if (isCancel(confirmed) || confirmed !== "uninstall") onCancel()
  } else if (!flags.noPrompt) {
    throw new Error("Non-interactive uninstall requires --yes / --no-prompt.")
  }

  const settingsAfter = removePackage(settingsBefore)
  backupIfExists(paths.settingsPath, paths.settingsBackupPath)
  backupIfExists(paths.configPath, paths.configBackupPath)
  writeSettings(paths.settingsPath, settingsAfter)
  if (existsSync(paths.configPath)) rmSync(paths.configPath)
  process.stdout.write(`Removed Latitude pi telemetry from ${paths.agentDir}. Restart pi to unload it.\n`)
}

function resolvePiAgentDirFromFlags(flags: InstallFlags | UninstallFlags): string {
  if (flags.piDir) return flags.piDir
  return resolvePiAgentDir()
}

async function promptApiKey(existing: string | undefined): Promise<string> {
  const result = await password({
    message: "Latitude API key",
    mask: "•",
    ...(existing ? { placeholder: "reuse existing key" } : {}),
    validate: (value) => (value || existing ? undefined : "Required"),
  })
  if (isCancel(result)) onCancel()
  return result || existing || ""
}

async function promptProject(existing: string | undefined): Promise<string> {
  const result = await text({
    message: "Latitude project slug",
    placeholder: existing ?? "my-project",
    ...(existing ? { initialValue: existing } : {}),
    validate: (value) => (value ? undefined : "Required"),
  })
  if (isCancel(result)) onCancel()
  return result
}

function onCancel(): never {
  cancel("Cancelled — nothing was changed")
  process.exit(1)
}
