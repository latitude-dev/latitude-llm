import { existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { cancel, confirm, intro, isCancel, log, note, outro, password, spinner, text } from "@clack/prompts"
import pc from "picocolors"
import { installPluginFiles, removePluginFiles } from "./install-files.ts"
import {
  backupSettings,
  hasLatitudePlugin,
  type LatitudePluginConfig,
  migrateLegacyEntries,
  PLUGIN_ID,
  PLUGIN_INSTALL_DIR,
  readSettings,
  removePluginEntry,
  SETTINGS_BACKUP_PATH,
  SETTINGS_PATH,
  setPluginEntry,
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
  allowConversationAccess?: boolean
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
  // Default: capture conversation content. Users who don't want it can pass
  // --no-content (or set it to false later in openclaw.json).
  let allowConversationAccess = true
  if (flags["no-content"] === true || flags["no-conversation"] === true) allowConversationAccess = false
  if (flags["allow-conversation"] === false) allowConversationAccess = false

  return {
    apiKey: typeof flags["api-key"] === "string" ? flags["api-key"] : undefined,
    project: typeof flags.project === "string" ? flags.project : undefined,
    environment,
    allowConversationAccess,
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
  const existingConfig =
    (existing.plugins?.entries?.[PLUGIN_ID]?.config as LatitudePluginConfig | undefined) ?? undefined
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

  const apiKey = await promptApiKey(existingConfig?.apiKey, flags.apiKey)
  const project = await promptProject(existingConfig?.project, flags.project)

  await applyChanges({
    apiKey,
    project,
    envConfig,
    allowConversationAccess: flags.allowConversationAccess ?? true,
  })

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
  await applyChanges({
    apiKey,
    project,
    envConfig,
    allowConversationAccess: flags.allowConversationAccess ?? true,
  })
  process.stdout.write(`Installed Latitude plugin in ${SETTINGS_PATH}\n`)
  process.stdout.write(`Plugin files at ${PLUGIN_INSTALL_DIR}\n`)
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
  allowConversationAccess: boolean
}

async function applyChanges({ apiKey, project, envConfig, allowConversationAccess }: ApplyParams): Promise<void> {
  // 1. Materialize plugin runtime files into ~/.openclaw/extensions/latitude-telemetry/
  //    so OpenClaw's plugin discovery picks them up. This MUST happen before
  //    we write the openclaw.json entry, otherwise the gateway file-watcher
  //    will see the entry, fail to find the plugin, and emit a warning.
  const filesSpinner = spinner()
  filesSpinner.start("Installing plugin files")
  const { destination } = installPluginFiles()
  filesSpinner.stop(`Plugin files installed at ${destination}`)

  // 2. Update openclaw.json with the plugin entry.
  const settingsSpinner = spinner()
  settingsSpinner.start("Updating openclaw.json")
  ensureSettingsDir()
  backupSettings()
  const settings = readSettings()
  // Migrate any leftover keys our 0.0.1 installer wrote that the strict zod
  // schema rejects. Without this, re-installing on top of a 0.0.1 install
  // would leave the gateway quarantining the file as `clobbered`.
  migrateLegacyEntries(settings)
  setPluginEntry(settings, {
    apiKey,
    project,
    baseUrl: envConfig.name === "production" ? undefined : envConfig.ingest,
    allowConversationAccess,
    debug: false,
  })
  writeSettings(settings)
  settingsSpinner.stop(`Updated ${SETTINGS_PATH}`)
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

  const hasEntry = hasLatitudePlugin(settings)
  const hasFiles = existsSync(PLUGIN_INSTALL_DIR)

  if (!hasEntry && !hasFiles) {
    note("No Latitude plugin entry or files found — nothing to remove.", "Status")
    outro(pc.dim("Nothing changed"))
    return
  }

  const plan = [
    hasEntry ? `Remove "${PLUGIN_ID}" plugin entry from ${SETTINGS_PATH}` : null,
    hasFiles ? `Delete plugin files at ${PLUGIN_INSTALL_DIR}` : null,
    `Backup of openclaw.json saved at ${SETTINGS_BACKUP_PATH}`,
  ].filter(Boolean) as string[]
  note(plan.join("\n"), "Plan")

  if (!flags.noPrompt && process.stdin.isTTY === true) {
    const ok = await confirm({ message: "Proceed?", initialValue: true })
    if (isCancel(ok) || ok !== true) return onCancel()
  }

  const s = spinner()
  s.start("Reverting settings")
  if (hasEntry) {
    backupSettings()
    removePluginEntry(settings)
    // Also clean any legacy keys our 0.0.1 installer left behind so the file
    // is fully back to a clean state.
    migrateLegacyEntries(settings)
    writeSettings(settings)
  }
  if (hasFiles) removePluginFiles()
  s.stop("Done")
  outro(pc.green("✓ Uninstalled"))
}
