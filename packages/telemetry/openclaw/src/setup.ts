import { existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { cancel, confirm, intro, isCancel, log, note, outro, password, spinner, text } from "@clack/prompts"
import pc from "picocolors"
import {
  backupSettings,
  ensurePluginEntry,
  hasLatitudePlugin,
  PLUGIN_ID,
  readSettings,
  removeEnv,
  removePluginEntry,
  SETTINGS_BACKUP_PATH,
  SETTINGS_PATH,
  setEnv,
  writeSettings,
} from "./settings-file.ts"

const DOCS_URL = "https://docs.latitude.so/openclaw-telemetry"

interface EnvironmentConfig {
  name: "production" | "staging" | "dev"
  label: string
  app: string
  ingest: string
}

const PRODUCTION_ENV: EnvironmentConfig = {
  name: "production",
  label: "production",
  app: "https://console.latitude.so",
  ingest: "https://ingest.latitude.so",
}
const STAGING_ENV: EnvironmentConfig = {
  name: "staging",
  label: "staging",
  app: "https://staging.latitude.so",
  ingest: "https://staging-ingest.latitude.so",
}
const DEV_ENV: EnvironmentConfig = {
  name: "dev",
  label: "local dev",
  app: "http://localhost:3000",
  ingest: "http://localhost:3002",
}

function urlsFor(env: EnvironmentConfig): {
  apiKeys: string
  projects: string
  projectView: (slug: string) => string
} {
  return {
    apiKeys: `${env.app}/settings/api-keys`,
    projects: env.app,
    projectView: (slug: string) => `${env.app}/projects/${slug}`,
  }
}

interface InstallFlags {
  apiKey?: string | undefined
  project?: string | undefined
  environment?: EnvironmentConfig | undefined
  noPrompt?: boolean
  yes?: boolean
}

export function parseFlags(argv: string[]): {
  subcommand: string | undefined
  flags: Record<string, string | boolean>
} {
  const [subcommand, ...rest] = argv
  const flags: Record<string, string | boolean> = {}
  for (const arg of rest) {
    if (!arg.startsWith("--")) continue
    const eq = arg.indexOf("=")
    if (eq >= 0) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1)
    } else {
      flags[arg.slice(2)] = true
    }
  }
  return { subcommand, flags }
}

export function normalizeInstallFlags(flags: Record<string, string | boolean>): InstallFlags {
  let environment: EnvironmentConfig | undefined
  if (flags.staging === true) environment = STAGING_ENV
  if (flags.dev === true) {
    if (environment) throw new Error("--staging and --dev are mutually exclusive")
    environment = DEV_ENV
  }
  return {
    apiKey: typeof flags["api-key"] === "string" ? flags["api-key"] : undefined,
    project: typeof flags.project === "string" ? flags.project : undefined,
    environment,
    noPrompt: flags["no-prompt"] === true || flags.yes === true,
    yes: flags.yes === true,
  }
}

// ─── Install ────────────────────────────────────────────────────────────────

export async function runInstall(flags: InstallFlags = {}): Promise<void> {
  const canPrompt = !flags.noPrompt && process.stdin.isTTY === true
  if (!canPrompt) return runFlagDrivenInstall(flags)
  await runInteractiveInstall(flags)
}

async function runInteractiveInstall(flags: InstallFlags): Promise<void> {
  intro(pc.bgCyan(pc.black(" Latitude · OpenClaw telemetry ")))

  const existing = readSettings()
  const existingEnv = existing.env ?? {}
  const envConfig = flags.environment ?? PRODUCTION_ENV
  const urls = urlsFor(envConfig)

  const aboutLines = [
    "Captures every OpenClaw agent run and ships it to Latitude as",
    "OpenTelemetry traces — full system prompt, tool I/O, messages,",
    "token usage, and agent name on every span.",
    "",
    `${pc.dim("Docs")}   ${pc.cyan(DOCS_URL)}`,
  ]
  if (envConfig.name !== "production") {
    aboutLines.push("", pc.yellow(`Using ${envConfig.label} environment (${envConfig.ingest})`))
  }
  note(aboutLines.join("\n"), "About")

  log.info(`Get an API key at ${pc.cyan(urls.apiKeys)}`)
  log.info(`Create a project at ${pc.cyan(urls.projects)}`)

  const apiKey = await promptApiKey(existingEnv.LATITUDE_API_KEY, flags.apiKey)
  const project = await promptProject(existingEnv.LATITUDE_PROJECT, flags.project)

  await applyChanges({ apiKey, project, envConfig })

  note(
    [
      "Restart the OpenClaw gateway for the plugin to load:",
      pc.dim("  openclaw gateway restart"),
      "",
      `View your traces at  ${pc.cyan(urls.projectView(project))}`,
    ].join("\n"),
    "Next step",
  )
  outro(pc.green("✓ Installed"))
}

async function runFlagDrivenInstall(flags: InstallFlags): Promise<void> {
  const apiKey = flags.apiKey
  const project = flags.project
  if (!apiKey || !project) {
    throw new Error("Non-interactive install requires --api-key=... and --project=... (or run in a TTY).")
  }
  const envConfig = flags.environment ?? PRODUCTION_ENV
  await applyChanges({ apiKey, project, envConfig })
  process.stdout.write(`Installed Latitude plugin in ${SETTINGS_PATH}\n`)
}

async function promptApiKey(_existing: string | undefined, flag: string | undefined): Promise<string> {
  if (flag) return flag
  const result = await password({
    message: "Latitude API key",
    mask: "•",
    validate: (v) => (v && v.length > 0 ? undefined : "Required"),
  })
  if (isCancel(result)) return onCancel()
  return result
}

async function promptProject(existing: string | undefined, flag: string | undefined): Promise<string> {
  if (flag) return flag
  const result = await text({
    message: "Latitude project slug",
    placeholder: existing ?? "my-openclaw-project",
    ...(existing ? { initialValue: existing } : {}),
    validate: (v) => (v && v.length > 0 ? undefined : "Required"),
  })
  if (isCancel(result)) return onCancel()
  return result
}

function onCancel(): never {
  cancel("Cancelled — nothing was changed")
  process.exit(1)
}

interface ApplyParams {
  apiKey: string
  project: string
  envConfig: EnvironmentConfig
}

async function applyChanges({ apiKey, project, envConfig }: ApplyParams): Promise<void> {
  const s = spinner()
  s.start("Updating openclaw.json")
  ensureSettingsDir()
  backupSettings()
  const settings = readSettings()
  ensurePluginEntry(settings)
  setEnv(settings, "LATITUDE_API_KEY", apiKey)
  setEnv(settings, "LATITUDE_PROJECT", project)
  if (envConfig.name !== "production") setEnv(settings, "LATITUDE_BASE_URL", envConfig.ingest)
  writeSettings(settings)
  s.stop(`Updated ${SETTINGS_PATH}`)
  if (existsSync(SETTINGS_BACKUP_PATH)) log.info(`Backup saved at ${pc.dim(SETTINGS_BACKUP_PATH)}`)
}

function ensureSettingsDir(): void {
  const dir = dirname(SETTINGS_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

// ─── Uninstall ──────────────────────────────────────────────────────────────

interface UninstallFlags {
  noPrompt?: boolean
}

export async function runUninstall(flags: UninstallFlags = {}): Promise<void> {
  intro(pc.bgYellow(pc.black(" Latitude · OpenClaw telemetry — uninstall ")))
  const settings = readSettings()

  if (!hasLatitudePlugin(settings)) {
    note("No Latitude plugin entry found — nothing to remove.", "Status")
    outro(pc.dim("Nothing changed"))
    return
  }

  const plan = [
    `Remove "${PLUGIN_ID}" plugin entry from ${SETTINGS_PATH}`,
    "Remove LATITUDE_API_KEY / LATITUDE_PROJECT / LATITUDE_BASE_URL from env",
    `Backup saved at ${SETTINGS_BACKUP_PATH}`,
  ]
  note(plan.join("\n"), "Plan")

  if (!flags.noPrompt && process.stdin.isTTY === true) {
    const ok = await confirm({ message: "Proceed?", initialValue: true })
    if (isCancel(ok) || ok !== true) return onCancel()
  }

  const s = spinner()
  s.start("Reverting settings")
  backupSettings()
  removePluginEntry(settings)
  removeEnv(settings, ["LATITUDE_API_KEY", "LATITUDE_PROJECT", "LATITUDE_BASE_URL"])
  writeSettings(settings)
  s.stop("Done")
  outro(pc.green("✓ Uninstalled"))
}
