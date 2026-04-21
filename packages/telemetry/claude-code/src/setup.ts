import { spawnSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { cancel, confirm, intro, isCancel, log, note, outro, password, spinner, text } from "@clack/prompts"
import pc from "picocolors"
import {
  addLatitudeStopHook,
  backupSettings,
  type ClaudeSettings,
  hasLatitudeStopHook,
  readSettings,
  removeEnv,
  removeLatitudeStopHook,
  SETTINGS_BACKUP_PATH,
  SETTINGS_PATH,
  setEnv,
  writeSettings,
} from "./settings-file.ts"

const STATE_DIR = join(homedir(), ".claude", "state", "latitude")
const INTERCEPT_INSTALL_PATH = join(STATE_DIR, "intercept.js")
const REQUESTS_DIR = join(STATE_DIR, "requests")
const STATE_FILE = join(STATE_DIR, "state.json")
const PLIST_PATH = join(homedir(), "Library", "LaunchAgents", "so.latitude.claude-code-telemetry.plist")
const PLIST_LABEL = "so.latitude.claude-code-telemetry"
const DEFAULT_HOOK_COMMAND = "npx -y @latitude-data/claude-code-telemetry"
const DOCS_URL = "https://docs.latitude.so/claude-code-telemetry"

// Environments pick the app + ingest domain pair. Every URL shown or written
// during install is derived from these two — there's no other source of truth.
interface EnvironmentConfig {
  name: "production" | "staging" | "dev"
  label: string
  app: string // user-facing dashboard + key management origin
  ingest: string // OTLP ingest origin; stored in settings as LATITUDE_BASE_URL
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
  noLaunchctl?: boolean
  noPrompt?: boolean
}

// ─── Install ─────────────────────────────────────────────────────────────────

export async function runInstall(flags: InstallFlags = {}): Promise<void> {
  const canPrompt = !flags.noPrompt && process.stdin.isTTY === true
  const hasAnyFlags = Boolean(flags.apiKey || flags.project || flags.environment || flags.noPrompt || flags.noLaunchctl)

  if (!canPrompt) {
    if (!hasAnyFlags) {
      // No flags, no TTY — we can't prompt and there's nothing to write to
      // settings.json. Materialize just the preload file so users who want to
      // wire BUN_OPTIONS themselves have the file available, then return.
      writeIntercept()
      printMinimalInstallInstructions()
      return
    }
    return runFlagDrivenInstall(flags)
  }

  await runInteractiveInstall(flags)
}

async function runInteractiveInstall(flags: InstallFlags): Promise<void> {
  intro(pc.bgCyan(pc.black(" Latitude · Claude Code telemetry ")))

  const existing = readSettingsSafe()
  const existingEnv = existing.env ?? {}
  const envConfig = flags.environment ?? PRODUCTION_ENV
  const urls = urlsFor(envConfig)

  const aboutLines = [
    "Captures every Claude Code session and ships it to Latitude as",
    "OpenTelemetry traces — full system prompt, tool defs, and",
    "model I/O per call.",
    "",
    `${pc.dim("Docs")}   ${pc.cyan(DOCS_URL)}`,
  ]
  if (envConfig.name !== "production") {
    aboutLines.push("", pc.yellow(`Using ${envConfig.label} environment (${envConfig.ingest})`))
  }
  note(aboutLines.join("\n"), "About")

  const apiKey = await promptApiKey(existingEnv.LATITUDE_API_KEY, flags.apiKey, urls.apiKeys)
  const project = await promptProject(existingEnv.LATITUDE_PROJECT, flags.project, urls.projects)

  let useLaunchctl = false
  if (process.platform === "darwin" && !flags.noLaunchctl) {
    log.info(
      [
        "macOS Claude Desktop doesn't forward settings.json env vars to the",
        "claude runtime. Wiring BUN_OPTIONS via launchctl covers both the",
        "GUI app and terminal claude, and survives reboots.",
      ].join("\n"),
    )
    const answer = await confirm({
      message: "Set up launchctl? (recommended)",
      initialValue: true,
    })
    if (isCancel(answer)) return onCancel()
    useLaunchctl = answer === true
  }

  await applyChanges({ apiKey, project, envConfig, useLaunchctl, existing, interactive: true })

  note(
    [
      "Quit claude fully and relaunch for the preload to attach.",
      "",
      `${pc.dim("  Terminal       ")}close and reopen your terminal`,
      `${pc.dim("  Claude Desktop ")}⌘Q, then relaunch from Dock / Finder`,
      "",
      `View your traces at  ${pc.cyan(urls.projectView(project))}`,
    ].join("\n"),
    "Next step",
  )

  outro(pc.green("Installed."))
}

async function promptApiKey(
  existing: string | undefined,
  flag: string | undefined,
  apiKeysUrl: string,
): Promise<string> {
  if (flag) return flag

  const description = existing
    ? `Your Latitude API key. Press Enter to keep the existing one (${maskKey(existing)}),\nor generate a new one at ${pc.cyan(apiKeysUrl)}`
    : `Your Latitude API key. Generate one at ${pc.cyan(apiKeysUrl)}`

  const input = await password({
    message: `Latitude API key\n${pc.dim(description)}`,
    mask: "•",
    validate: (value) => {
      if (!value && !existing) return `An API key is required. Create one at ${apiKeysUrl}`
      return undefined
    },
  })
  if (isCancel(input)) return onCancel() as never
  return input || existing || ""
}

async function promptProject(
  existing: string | undefined,
  flag: string | undefined,
  projectsUrl: string,
): Promise<string> {
  if (flag) return flag

  const description = existing
    ? `The slug of the Latitude project to route traces into.\nPress Enter to keep the existing one (${existing}),\nor create a new one at ${pc.cyan(projectsUrl)}.`
    : `The slug of the Latitude project to route traces into.\nCreate one at ${pc.cyan(projectsUrl)} if you don't have one yet.`

  const input = await text({
    message: `Project slug\n${pc.dim(description)}`,
    validate: (value) => {
      if (!value?.trim() && !existing) return "A project slug is required"
      return undefined
    },
  })
  if (isCancel(input)) return onCancel() as never
  return input.trim() || existing || ""
}

// ─── Apply changes (shared between interactive + flag-driven) ────────────────

interface ApplyArgs {
  apiKey: string
  project: string
  envConfig: EnvironmentConfig
  useLaunchctl: boolean
  existing: ClaudeSettings
  interactive: boolean
}

async function applyChanges(args: ApplyArgs): Promise<void> {
  const { apiKey, project, envConfig, useLaunchctl, existing, interactive } = args

  let next = existing
  if (apiKey) next = setEnv(next, "LATITUDE_API_KEY", apiKey)
  if (project) next = setEnv(next, "LATITUDE_PROJECT", project)
  // Only persist LATITUDE_BASE_URL when it differs from production — production is
  // the implicit default on the hook side, and writing it explicitly just adds
  // noise to settings.json.
  if (envConfig.name === "production") next = removeEnv(next, "LATITUDE_BASE_URL")
  else next = setEnv(next, "LATITUDE_BASE_URL", envConfig.ingest)

  if (useLaunchctl) next = removeEnv(next, "BUN_OPTIONS")
  else next = setEnv(next, "BUN_OPTIONS", `--preload=${INTERCEPT_INSTALL_PATH}`)

  const hookAlreadyThere = hasLatitudeStopHook(next)
  next = addLatitudeStopHook(next, DEFAULT_HOOK_COMMAND)

  const step = stepLogger(interactive)

  step.start("Writing ~/.claude/settings.json")
  const backedUp = backupSettings()
  writeSettings(next)
  step.stop(
    [
      `~/.claude/settings.json updated`,
      hookAlreadyThere ? "" : "  + Stop hook installed",
      backedUp ? pc.dim(`  (backup at ${SETTINGS_BACKUP_PATH})`) : pc.dim("  (new file)"),
    ]
      .filter(Boolean)
      .join("\n"),
  )

  step.start("Installing preload")
  writeIntercept()
  step.stop(`Preload at ${INTERCEPT_INSTALL_PATH}`)

  if (useLaunchctl) {
    step.start("Setting BUN_OPTIONS via launchctl + installing persistence plist")
    setLaunchctlBunOptions()
    writePlist()
    step.stop(`launchctl env set (persisted via ${PLIST_PATH})`)
  }
}

interface StepLogger {
  start: (message: string) => void
  stop: (message: string) => void
}

function stepLogger(interactive: boolean): StepLogger {
  if (interactive) {
    const s = spinner()
    return { start: (m) => s.start(m), stop: (m) => s.stop(m) }
  }
  return {
    start: (m) => process.stdout.write(`  … ${m}\n`),
    stop: (m) => process.stdout.write(`  ✓ ${m.split("\n")[0]}\n`),
  }
}

// ─── Flag-driven install (non-TTY or --no-prompt + flags) ────────────────────

async function runFlagDrivenInstall(flags: InstallFlags): Promise<void> {
  const existing = readSettingsSafe()
  const existingEnv = existing.env ?? {}

  const apiKey = flags.apiKey ?? existingEnv.LATITUDE_API_KEY ?? ""
  const project = flags.project ?? existingEnv.LATITUDE_PROJECT ?? ""

  // Flag-driven mode can't fall back to prompts, so fail fast if either
  // required value is missing. Writing settings.json with an empty key/project
  // would look "installed" but the hook silently disables itself at runtime
  // (loadConfig requires both), which is harder to diagnose than an exit 1 here.
  const missing: string[] = []
  if (!apiKey) missing.push("--api-key")
  if (!project) missing.push("--project")
  if (missing.length > 0) {
    process.stderr.write(
      `[latitude-claude-code] missing required value${missing.length === 1 ? "" : "s"} for non-interactive install: ${missing.join(", ")}\n`,
    )
    process.stderr.write(
      `[latitude-claude-code] either pass ${missing.join(" + ")}, or drop --no-prompt to answer interactively.\n`,
    )
    process.exit(1)
  }

  const envConfig = flags.environment ?? PRODUCTION_ENV
  const useLaunchctl = process.platform === "darwin" && !flags.noLaunchctl

  process.stdout.write(`Installing Latitude Claude Code telemetry (${envConfig.label})…\n`)
  await applyChanges({ apiKey, project, envConfig, useLaunchctl, existing, interactive: false })
  process.stdout.write(`\nInstalled. Quit claude and relaunch (new terminal, or ⌘Q + relaunch Claude Desktop).\n`)
}

// ─── Uninstall ───────────────────────────────────────────────────────────────

export async function runUninstall(flags: { noPrompt?: boolean } = {}): Promise<void> {
  const interactive = !flags.noPrompt && process.stdin.isTTY === true
  const plan = buildUninstallPlan()

  if (interactive) {
    intro(pc.bgRed(pc.white(" Latitude · Claude Code telemetry ")))
  } else {
    process.stdout.write("Uninstalling Latitude Claude Code telemetry…\n")
  }

  if (plan.description.length === 0) {
    if (interactive) {
      log.info("Nothing to remove. You're already clean.")
      outro(pc.dim("Nothing to do."))
    } else {
      process.stdout.write("Nothing to remove.\n")
    }
    return
  }

  if (interactive) {
    note(plan.description.map((line) => pc.red("—  ") + line).join("\n"), "Will remove")

    const ok = await confirm({ message: "Proceed?", initialValue: false })
    if (isCancel(ok) || ok !== true) return onCancel("Uninstall cancelled.")
  }

  if (interactive) {
    const s = spinner()
    s.start("Removing")
    plan.execute()
    s.stop("Removed")
  } else {
    plan.execute()
    process.stdout.write("Removed.\n")
  }

  if (interactive) {
    note(
      [
        `Settings backup kept at  ${pc.cyan(SETTINGS_BACKUP_PATH)}`,
        "",
        "If launchctl was cleared, open a new terminal or relaunch",
        "Claude Desktop so the old BUN_OPTIONS fully drains.",
      ].join("\n"),
      "Cleanup notes",
    )
    outro(pc.green("Uninstalled."))
  } else {
    process.stdout.write(`Uninstalled. Backup at ${SETTINGS_BACKUP_PATH}\n`)
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function readSettingsSafe(): ClaudeSettings {
  try {
    return readSettings()
  } catch (err) {
    process.stderr.write(`[latitude-claude-code] ${String(err)}\n`)
    process.exit(1)
  }
}

function maskKey(key: string): string {
  if (key.length < 8) return "•".repeat(key.length)
  return `${key.slice(0, 4)}${"•".repeat(3)}${key.slice(-3)}`
}

function onCancel(message = "Setup cancelled."): never {
  cancel(message)
  process.exit(0)
}

function writeIntercept(): void {
  const src = fileURLToPath(new URL("./intercept.js", import.meta.url))
  if (!existsSync(src)) {
    process.stderr.write(`[latitude-claude-code] bundled intercept.js missing at ${src}\n`)
    process.exit(1)
  }
  mkdirSync(dirname(INTERCEPT_INSTALL_PATH), { recursive: true })
  copyFileSync(src, INTERCEPT_INSTALL_PATH)
}

function setLaunchctlBunOptions(): void {
  const value = `--preload=${INTERCEPT_INSTALL_PATH}`
  const res = spawnSync("launchctl", ["setenv", "BUN_OPTIONS", value], { encoding: "utf-8" })
  if (res.status !== 0) {
    const details = [res.stderr, res.stdout]
      .filter((s) => s && s.trim().length > 0)
      .join(" ")
      .trim()
    process.stderr.write(
      `[latitude-claude-code] launchctl setenv failed (exit ${res.status})${details ? `: ${details}` : ""}. Continuing.\n`,
    )
  }
}

function writePlist(): void {
  mkdirSync(dirname(PLIST_PATH), { recursive: true })
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>launchctl</string>
    <string>setenv</string>
    <string>BUN_OPTIONS</string>
    <string>--preload=${INTERCEPT_INSTALL_PATH}</string>
  </array>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
`
  writeFileSync(PLIST_PATH, plist, "utf-8")
  // Unload may fail harmlessly if the agent was never loaded — we don't care.
  spawnSync("launchctl", ["unload", PLIST_PATH], { stdio: "ignore" })
  const res = spawnSync("launchctl", ["load", PLIST_PATH], { encoding: "utf-8" })
  if (res.status !== 0) {
    const details = [res.stderr, res.stdout]
      .filter((s) => s && s.trim().length > 0)
      .join(" ")
      .trim()
    process.stderr.write(
      `[latitude-claude-code] launchctl load failed (exit ${res.status})${details ? `: ${details}` : ""}. Continuing.\n`,
    )
  }
}

function printMinimalInstallInstructions(): void {
  process.stdout.write(
    [
      `Installed intercept preload to: ${INTERCEPT_INSTALL_PATH}`,
      "",
      "Non-interactive mode — settings.json and launchctl not touched.",
      "To complete setup, expose BUN_OPTIONS to the claude runtime. See the README for options.",
      "",
    ].join("\n"),
  )
}

interface UninstallPlan {
  description: string[]
  execute: () => void
}

function buildUninstallPlan(): UninstallPlan {
  const description: string[] = []
  const steps: Array<() => void> = []

  if (existsSync(SETTINGS_PATH)) {
    let settings: ClaudeSettings
    try {
      settings = readSettings()
    } catch (err) {
      process.stderr.write(`[latitude-claude-code] ${String(err)}\n`)
      process.exit(1)
    }
    const env = settings.env ?? {}
    const latitudeKeys = ["LATITUDE_API_KEY", "LATITUDE_PROJECT", "LATITUDE_BASE_URL"].filter((k) => k in env)
    const removeBunOptions = env.BUN_OPTIONS?.includes(INTERCEPT_INSTALL_PATH) === true
    const hasHook = hasLatitudeStopHook(settings)

    if (latitudeKeys.length > 0 || removeBunOptions || hasHook) {
      const parts: string[] = []
      if (latitudeKeys.length > 0) parts.push(latitudeKeys.join(", "))
      if (removeBunOptions) parts.push("BUN_OPTIONS")
      if (hasHook) parts.push("Stop hook entry")
      description.push(`~/.claude/settings.json: remove ${parts.join(" + ")} (backup at settings.json.latitude-bak)`)

      steps.push(() => {
        const current = readSettings()
        backupSettings()
        let next = current
        for (const key of latitudeKeys) next = removeEnv(next, key)
        if (removeBunOptions) next = removeEnv(next, "BUN_OPTIONS")
        next = removeLatitudeStopHook(next)
        writeSettings(next)
      })
    }
  }

  const currentLaunchd = readLaunchctlBunOptions()
  if (currentLaunchd?.includes(INTERCEPT_INSTALL_PATH)) {
    description.push(`launchctl: unsetenv BUN_OPTIONS (currently: ${currentLaunchd})`)
    steps.push(() => {
      spawnSync("launchctl", ["unsetenv", "BUN_OPTIONS"], { stdio: "ignore" })
    })
  } else if (currentLaunchd) {
    description.push(`launchctl BUN_OPTIONS is set to something else (${currentLaunchd}); leaving it alone`)
  }

  if (existsSync(PLIST_PATH)) {
    description.push(`~/Library/LaunchAgents/${PLIST_LABEL}.plist: unload + remove`)
    steps.push(() => {
      spawnSync("launchctl", ["unload", PLIST_PATH], { stdio: "ignore" })
      try {
        unlinkSync(PLIST_PATH)
      } catch {
        // already gone
      }
    })
  }

  if (existsSync(STATE_DIR)) {
    const pieces: string[] = []
    if (existsSync(INTERCEPT_INSTALL_PATH)) pieces.push("intercept.js")
    if (existsSync(REQUESTS_DIR)) pieces.push("requests/")
    if (existsSync(STATE_FILE)) pieces.push("state.json")
    if (pieces.length > 0) {
      description.push(`~/.claude/state/latitude/: remove ${pieces.join(", ")}`)
      steps.push(() => {
        rmSync(STATE_DIR, { recursive: true, force: true })
      })
    }
  }

  return {
    description,
    execute: () => {
      for (const step of steps) {
        try {
          step()
        } catch (err) {
          process.stderr.write(`[latitude-claude-code] uninstall step failed: ${String(err)}\n`)
        }
      }
    },
  }
}

function readLaunchctlBunOptions(): string | undefined {
  if (process.platform !== "darwin") return undefined
  const res = spawnSync("launchctl", ["getenv", "BUN_OPTIONS"], { encoding: "utf-8" })
  if (res.status !== 0) return undefined
  const out = (res.stdout ?? "").trim()
  return out || undefined
}

// ─── Flag parsing ────────────────────────────────────────────────────────────

export function parseFlags(argv: string[]): { subcommand: string; flags: Record<string, string | boolean> } {
  const subcommand = argv[0] ?? ""
  const flags: Record<string, string | boolean> = {}
  for (const arg of argv.slice(1)) {
    if (!arg.startsWith("--")) continue
    const eq = arg.indexOf("=")
    if (eq === -1) flags[arg.slice(2)] = true
    else flags[arg.slice(2, eq)] = arg.slice(eq + 1)
  }
  return { subcommand, flags }
}

export function normalizeInstallFlags(flags: Record<string, string | boolean>): InstallFlags {
  // Coerce raw flag values into a non-empty string, or undefined if the user
  // passed the flag without a value (`--api-key=`) or omitted it entirely.
  // Empty-string values are treated as "not provided" so downstream code falls
  // through to the interactive prompt or the existing settings.json value,
  // instead of silently writing an empty key/project to disk.
  const str = (v: string | boolean | undefined): string | undefined => {
    if (typeof v !== "string") return undefined
    const trimmed = v.trim()
    return trimmed === "" ? undefined : trimmed
  }

  let environment: EnvironmentConfig | undefined
  const dev = flags.dev === true
  const staging = flags.staging === true
  if (dev && staging) {
    process.stderr.write("[latitude-claude-code] --dev and --staging are mutually exclusive\n")
    process.exit(1)
  }
  if (dev) environment = DEV_ENV
  else if (staging) environment = STAGING_ENV

  const result: InstallFlags = {
    noLaunchctl: flags["no-launchctl"] === true || flags.no_launchctl === true,
    noPrompt: flags["no-prompt"] === true || flags.no_prompt === true || flags.yes === true,
  }
  const apiKey = str(flags["api-key"] ?? flags.api_key)
  if (apiKey !== undefined) result.apiKey = apiKey
  const project = str(flags.project)
  if (project !== undefined) result.project = project
  if (environment !== undefined) result.environment = environment
  return result
}
