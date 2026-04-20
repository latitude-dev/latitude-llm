import { spawnSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { createInterface } from "node:readline/promises"
import { fileURLToPath } from "node:url"
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
const DEFAULT_BASE_URL = "https://ingest.latitude.so"
const DEFAULT_HOOK_COMMAND = "npx -y @latitude-data/claude-code-telemetry"

interface InstallFlags {
  apiKey?: string | undefined
  project?: string | undefined
  baseUrl?: string | undefined
  noLaunchctl?: boolean
  noPrompt?: boolean
}

export async function runInstall(flags: InstallFlags = {}): Promise<void> {
  writeIntercept()

  const canPrompt = !flags.noPrompt && process.stdin.isTTY === true
  const hasAnyFlags = Boolean(flags.apiKey || flags.project || flags.baseUrl || flags.noPrompt || flags.noLaunchctl)

  // Pure non-interactive (no TTY, no flags) = just install the preload silently so
  // CI / scripts keep working. Adding any flag forces the wizard path (flag-driven
  // when canPrompt is false).
  if (!canPrompt && !hasAnyFlags) {
    printMinimalInstallInstructions()
    return
  }

  const rl = canPrompt ? createInterface({ input: process.stdin, output: process.stdout }) : undefined
  try {
    process.stdout.write("\nLatitude Claude Code Telemetry — setup\n")
    process.stdout.write("======================================\n\n")

    const existing = readSettingsSafe()
    const existingEnv = existing.env ?? {}

    const apiKey =
      flags.apiKey ??
      (rl
        ? await askWithDefault(rl, "LATITUDE_API_KEY", existingEnv.LATITUDE_API_KEY)
        : (existingEnv.LATITUDE_API_KEY ?? ""))
    const project =
      flags.project ??
      (rl
        ? await askWithDefault(rl, "LATITUDE_PROJECT", existingEnv.LATITUDE_PROJECT)
        : (existingEnv.LATITUDE_PROJECT ?? ""))
    const baseUrl =
      flags.baseUrl ??
      (rl
        ? await askWithDefault(rl, "LATITUDE_BASE_URL", existingEnv.LATITUDE_BASE_URL ?? DEFAULT_BASE_URL)
        : (existingEnv.LATITUDE_BASE_URL ?? DEFAULT_BASE_URL))

    let useLaunchctl = false
    if (process.platform === "darwin" && !flags.noLaunchctl) {
      if (rl) {
        process.stdout.write("\nmacOS detected.\n")
        process.stdout.write("Set BUN_OPTIONS via launchctl? This lets the preload work for both terminal\n")
        process.stdout.write("claude AND the Claude Desktop GUI, and persists across reboots.\n")
        useLaunchctl = await confirm(rl, "Set up launchctl", true)
      } else {
        useLaunchctl = true // on macOS, default to launchctl when flag-driven unless --no-launchctl
      }
    }

    let next = existing
    if (apiKey) next = setEnv(next, "LATITUDE_API_KEY", apiKey)
    if (project) next = setEnv(next, "LATITUDE_PROJECT", project)
    if (baseUrl && baseUrl !== DEFAULT_BASE_URL) next = setEnv(next, "LATITUDE_BASE_URL", baseUrl)
    else if (existingEnv.LATITUDE_BASE_URL === DEFAULT_BASE_URL) next = removeEnv(next, "LATITUDE_BASE_URL")

    if (useLaunchctl) {
      // launchctl covers both CLI and GUI; remove the redundant settings.json entry.
      next = removeEnv(next, "BUN_OPTIONS")
    } else {
      next = setEnv(next, "BUN_OPTIONS", `--preload=${INTERCEPT_INSTALL_PATH}`)
    }

    const addedHook = !hasLatitudeStopHook(next)
    next = addLatitudeStopHook(next, DEFAULT_HOOK_COMMAND)

    const backedUp = backupSettings()
    writeSettings(next)

    if (useLaunchctl) {
      setLaunchctlBunOptions()
      writePlist()
    }

    printInstallSummary({
      backedUp,
      addedHook,
      useLaunchctl,
      apiKey: Boolean(apiKey),
      project: Boolean(project),
      baseUrl: Boolean(baseUrl) && baseUrl !== DEFAULT_BASE_URL,
    })
    printRelaunchReminder()
  } finally {
    rl?.close()
  }
}

export async function runUninstall(flags: { noPrompt?: boolean } = {}): Promise<void> {
  const interactive = !flags.noPrompt && process.stdin.isTTY === true

  const plan = buildUninstallPlan()

  process.stdout.write("\nLatitude Claude Code Telemetry — uninstall\n")
  process.stdout.write("==========================================\n\n")
  process.stdout.write("The following will be removed:\n")
  for (const line of plan.description) process.stdout.write(`  • ${line}\n`)
  if (plan.description.length === 0) {
    process.stdout.write("  (nothing to remove — install artifacts not found)\n")
    return
  }

  if (interactive) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    try {
      const ok = await confirm(rl, "\nProceed with uninstall", false)
      if (!ok) {
        process.stdout.write("Aborted.\n")
        return
      }
    } finally {
      rl.close()
    }
  }

  plan.execute()
  process.stdout.write("\nUninstall complete.\n")
  process.stdout.write(`Settings backup: ${SETTINGS_BACKUP_PATH}\n`)
  process.stdout.write("If launchctl was reset, open a new terminal / relaunch Claude Desktop to clear BUN_OPTIONS.\n")
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

async function askWithDefault(
  rl: ReturnType<typeof createInterface>,
  label: string,
  current: string | undefined,
): Promise<string> {
  const hint = current ? ` [${maskSecret(label, current)}]` : ""
  const answer = (await rl.question(`${label}${hint}: `)).trim()
  if (answer) return answer
  return current ?? ""
}

function maskSecret(label: string, value: string): string {
  if (!/API_KEY|TOKEN|SECRET/i.test(label) || value.length <= 8) return value
  return `${value.slice(0, 5)}…${value.slice(-3)}`
}

async function confirm(rl: ReturnType<typeof createInterface>, prompt: string, defaultYes: boolean): Promise<boolean> {
  const hint = defaultYes ? "[Y/n]" : "[y/N]"
  const answer = (await rl.question(`${prompt}? ${hint}: `)).trim().toLowerCase()
  if (!answer) return defaultYes
  return answer === "y" || answer === "yes"
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
  const res = spawnSync("launchctl", ["setenv", "BUN_OPTIONS", value], { stdio: "inherit" })
  if (res.status !== 0) {
    process.stderr.write(`[latitude-claude-code] launchctl setenv failed (exit ${res.status}). Continuing.\n`)
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
  // (Re)load so it'll auto-set BUN_OPTIONS on every login.
  spawnSync("launchctl", ["unload", PLIST_PATH], { stdio: "ignore" })
  const res = spawnSync("launchctl", ["load", PLIST_PATH], { stdio: "inherit" })
  if (res.status !== 0) {
    process.stderr.write(`[latitude-claude-code] launchctl load failed (exit ${res.status}). Continuing.\n`)
  }
}

interface UninstallPlan {
  description: string[]
  execute: () => void
}

function buildUninstallPlan(): UninstallPlan {
  const description: string[] = []
  const steps: Array<() => void> = []

  // Settings.json cleanup
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

  // launchctl BUN_OPTIONS (only if it's ours)
  const currentLaunchd = readLaunchctlBunOptions()
  if (currentLaunchd && currentLaunchd.includes(INTERCEPT_INSTALL_PATH)) {
    description.push(`launchctl: unsetenv BUN_OPTIONS (currently: ${currentLaunchd})`)
    steps.push(() => {
      spawnSync("launchctl", ["unsetenv", "BUN_OPTIONS"], { stdio: "ignore" })
    })
  } else if (currentLaunchd) {
    description.push(`launchctl BUN_OPTIONS is set to something else (${currentLaunchd}); leaving it alone`)
  }

  // LaunchAgents plist
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

  // State dir: intercept.js, requests/*.json, state.json
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

function printInstallSummary(args: {
  backedUp: boolean
  addedHook: boolean
  useLaunchctl: boolean
  apiKey: boolean
  project: boolean
  baseUrl: boolean
}): void {
  process.stdout.write("\nDone. Summary:\n")
  process.stdout.write(`  ✓ Preload installed at ${INTERCEPT_INSTALL_PATH}\n`)
  if (args.backedUp) process.stdout.write(`  ✓ Backed up settings.json to ${SETTINGS_BACKUP_PATH}\n`)
  process.stdout.write("  ✓ Updated ~/.claude/settings.json:\n")
  if (args.apiKey) process.stdout.write("      - env.LATITUDE_API_KEY\n")
  if (args.project) process.stdout.write("      - env.LATITUDE_PROJECT\n")
  if (args.baseUrl) process.stdout.write("      - env.LATITUDE_BASE_URL\n")
  if (args.useLaunchctl) process.stdout.write("      - env.BUN_OPTIONS (removed — now handled by launchctl)\n")
  else process.stdout.write("      - env.BUN_OPTIONS (CLI path)\n")
  if (args.addedHook) process.stdout.write("      - hooks.Stop (added our command)\n")
  if (args.useLaunchctl) {
    process.stdout.write(`  ✓ launchctl setenv BUN_OPTIONS "--preload=${INTERCEPT_INSTALL_PATH}"\n`)
    process.stdout.write(`  ✓ Installed persistence plist at ${PLIST_PATH}\n`)
  }
}

function printRelaunchReminder(): void {
  process.stdout.write("\nNow fully quit and relaunch claude for the preload to take effect:\n")
  process.stdout.write("  • Terminal: open a new terminal window\n")
  process.stdout.write("  • Claude Desktop: ⌘Q to fully quit, then relaunch from Dock/Finder\n\n")
}

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
  const str = (v: string | boolean | undefined): string | undefined => (typeof v === "string" ? v : undefined)
  return {
    apiKey: str(flags["api-key"]),
    project: str(flags.project),
    baseUrl: str(flags["base-url"]),
    noLaunchctl: flags["no-launchctl"] === true,
    noPrompt: flags["no-prompt"] === true || flags.yes === true,
  }
}
