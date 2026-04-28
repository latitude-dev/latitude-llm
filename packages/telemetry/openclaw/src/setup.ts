import { existsSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { cancel, confirm, intro, isCancel, log, note, outro, password, spinner, text } from "@clack/prompts"
import pc from "picocolors"
import { compareCalver, getOpenclawVersion, MIN_OPENCLAW_VERSION, runOpenclaw } from "./openclaw-cli.ts"
import {
  addToPluginsAllow,
  backupSettings,
  hasLatitudePlugin,
  type LatitudePluginConfig,
  migrateLegacyEntries,
  PLUGIN_ID,
  readSettings,
  removeFromPluginsAllow,
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
  /**
   * Tristate: `true` = capture (`--allow-conversation`), `false` = scrub
   * (`--no-content`), `undefined` = preserve existing or first-install
   * default. Tristate keeps re-install idempotent for hand-edited values.
   */
  allowConversationAccess?: boolean | undefined
  /** When true, skip adding the plugin id to `plugins.allow`. */
  noTrust?: boolean
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
  // Tristate: leave undefined unless the user explicitly asked one way or the
  // other. Re-install then preserves whatever's already in openclaw.json.
  let allowConversationAccess: boolean | undefined
  if (flags["no-content"] === true || flags["no-conversation"] === true) allowConversationAccess = false
  if (flags["allow-conversation"] === true) allowConversationAccess = true

  return {
    apiKey: typeof flags["api-key"] === "string" ? flags["api-key"] : undefined,
    project: typeof flags.project === "string" ? flags.project : undefined,
    environment,
    allowConversationAccess,
    noTrust: flags["no-trust"] === true,
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

  // Bail before any prompts if the host OpenClaw is too old. We'd rather
  // tell the user to upgrade than walk them through a config we can't make
  // work on their version.
  ensureOpenclawIsCompatible()

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
    allowConversationAccess: flags.allowConversationAccess,
    noTrust: flags.noTrust === true,
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
  ensureOpenclawIsCompatible()
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
    allowConversationAccess: flags.allowConversationAccess,
    noTrust: flags.noTrust === true,
  })
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
  /** Tristate — see `InstallFlags.allowConversationAccess`. */
  allowConversationAccess: boolean | undefined
  noTrust: boolean
}

async function applyChanges({
  apiKey,
  project,
  envConfig,
  allowConversationAccess,
  noTrust,
}: ApplyParams): Promise<void> {
  // 1. Hand placement off to OpenClaw. `openclaw plugins install <path>`
  //    copies our package into ~/.openclaw/extensions/<encoded-id>/, writes
  //    the install record into ~/.openclaw/plugins/installs.json, and
  //    creates a (disabled, configless) plugins.entries[id] in
  //    openclaw.json. We layer config + hooks + allow on top in step 2.
  //    --force lets us overwrite an existing install (e.g. when re-running
  //    on top of a previous version).
  const packageRoot = resolvePackageRoot()
  const installSpinner = spinner()
  installSpinner.start(`Installing plugin via openclaw plugins install ${packageRoot}`)
  const installResult = runOpenclaw(["plugins", "install", packageRoot, "--force"], { timeoutMs: 60_000 })
  if (!installResult.ok) {
    installSpinner.stop("openclaw plugins install failed")
    if (installResult.reason === "enoent") {
      throw new Error("`openclaw` not found on PATH. Install OpenClaw first (https://openclaw.ai/install) and re-run.")
    }
    if (installResult.reason === "timeout") {
      throw new Error("openclaw plugins install timed out after 60s. Try running it manually to see what's stuck.")
    }
    const detail = installResult.stderr.trim() || installResult.stdout.trim() || `exit code ${installResult.code}`
    throw new Error(`openclaw plugins install failed: ${detail}`)
  }
  installSpinner.stop("Plugin registered with OpenClaw")

  // 2. Layer our config, hooks, and (optionally) plugins.allow on top of the
  //    entry OpenClaw just created. We don't touch placement — that's
  //    OpenClaw's job — only the policy fields.
  const settingsSpinner = spinner()
  settingsSpinner.start("Updating openclaw.json")
  ensureSettingsDir()
  backupSettings()
  const settings = readSettings()
  // Sweep `LATITUDE_*` keys our 0.0.1 leaked under settings.env. Idempotent
  // when the keys aren't there.
  migrateLegacyEntries(settings)

  // Decide allowConversationAccess for this install:
  //   - explicit flag (true|false) wins
  //   - else preserve whatever's already in openclaw.json
  //   - else first-install default is `true` (matches the README's promise)
  const existingConfig = (settings.plugins?.entries?.[PLUGIN_ID]?.config ?? {}) as Partial<LatitudePluginConfig>
  const finalAllowConversationAccess = allowConversationAccess ?? existingConfig.allowConversationAccess ?? true

  setPluginEntry(settings, {
    apiKey,
    project,
    baseUrl: envConfig.name === "production" ? undefined : envConfig.ingest,
    allowConversationAccess: finalAllowConversationAccess,
    // `debug` is intentionally not passed — `setPluginEntry` preserves
    // hand-edited values; fresh installs leave the key absent (runtime
    // default is `false`).
  })

  // Plugins.allow handling. Running `npx install` is itself the trust
  // signal — auto-add unless the user explicitly opted out via --no-trust.
  // Without this, OpenClaw prints a "plugins.allow is empty" warning at
  // every gateway start.
  if (!noTrust) {
    addToPluginsAllow(settings)
  }

  writeSettings(settings)
  settingsSpinner.stop(`Updated ${SETTINGS_PATH}`)
  if (existsSync(SETTINGS_BACKUP_PATH)) log.info(`Backup saved at ${pc.dim(SETTINGS_BACKUP_PATH)}`)
  if (noTrust) {
    log.warning(
      `--no-trust set; OpenClaw will warn at every gateway start that ${PLUGIN_ID} is untrusted. Add it to plugins.allow yourself when you're ready.`,
    )
  }
}

function ensureSettingsDir(): void {
  const dir = dirname(SETTINGS_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

/**
 * Verify `openclaw` is on PATH AND its version is >= MIN_OPENCLAW_VERSION.
 * Aborts with a clear upgrade message otherwise. Called before any user
 * prompts so we don't waste their time collecting credentials we can't
 * use.
 */
function ensureOpenclawIsCompatible(): void {
  const v = getOpenclawVersion()
  if (!v.ok) {
    if (v.error === "missing") {
      cancel("OpenClaw CLI not found on PATH. Install or update via `npm install -g openclaw@latest` and re-run.")
      process.exit(1)
    }
    cancel(
      `Couldn't parse OpenClaw version output${v.raw ? ` (got: ${pc.dim(v.raw)})` : ""}. Run \`openclaw --version\` and report the output.`,
    )
    process.exit(1)
  }
  if (compareCalver(v.version, MIN_OPENCLAW_VERSION) < 0) {
    cancel(
      `OpenClaw ${v.version} is older than the minimum supported version (${MIN_OPENCLAW_VERSION}). Run \`npm install -g openclaw@latest\` and re-run install.`,
    )
    process.exit(1)
  }
  log.info(`OpenClaw ${pc.dim(v.version)} (>= ${MIN_OPENCLAW_VERSION})`)
}

/**
 * Resolve the absolute path to our package's root (the directory that
 * contains `package.json` + `openclaw.plugin.json` + `dist/`). The compiled
 * CLI lives at `<package-root>/dist/cli.js`, so `import.meta.url`'s parent
 * directory's parent is our root.
 *
 * `openclaw plugins install <path>` copies files synchronously, so we
 * don't have to keep this directory alive past the spawn return.
 */
function resolvePackageRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  return resolve(here, "..")
}

// ─── Uninstall ──────────────────────────────────────────────────────────────

interface UninstallFlags {
  noPrompt?: boolean
}

export async function runUninstall(flags: UninstallFlags = {}): Promise<void> {
  intro(pc.bgYellow(pc.black(" Latitude · OpenClaw telemetry — uninstall ")))

  const settings = readSettings()
  const hasEntry = hasLatitudePlugin(settings)

  // Without an entry, there's nothing for `openclaw plugins uninstall` to
  // remove either — short-circuit cleanly. If the user wants to uninstall
  // even when our entry is gone (e.g. we crashed mid-install), they can
  // run `openclaw plugins uninstall` themselves.
  if (!hasEntry) {
    note("No Latitude plugin entry found — nothing to remove.", "Status")
    outro(pc.dim("Nothing changed"))
    return
  }

  const plan = [
    `Run \`openclaw plugins uninstall ${PLUGIN_ID} --force\` (removes files, install record, and plugin entry)`,
    `Sweep any leftover LATITUDE_* keys from settings.env`,
    `Backup of openclaw.json saved at ${SETTINGS_BACKUP_PATH}`,
  ]
  note(plan.join("\n"), "Plan")

  if (!flags.noPrompt && process.stdin.isTTY === true) {
    const ok = await confirm({ message: "Proceed?", initialValue: true })
    if (isCancel(ok) || ok !== true) return onCancel()
  }

  // 1. Hand uninstall to OpenClaw. It removes files, the install record,
  //    plugins.entries[id], plugins.allow, plugins.deny, plugins.load.paths
  //    — see src/plugins/uninstall.ts.
  const s = spinner()
  s.start("Reverting via openclaw plugins uninstall")
  const uninstallResult = runOpenclaw(["plugins", "uninstall", PLUGIN_ID, "--force"], { timeoutMs: 60_000 })
  if (!uninstallResult.ok) {
    s.stop("openclaw plugins uninstall failed")
    if (uninstallResult.reason === "enoent") {
      log.warning(
        "`openclaw` not found on PATH. Falling back to local cleanup — files at ~/.openclaw/extensions/ may remain.",
      )
    } else {
      const detail =
        uninstallResult.stderr.trim() || uninstallResult.stdout.trim() || `exit code ${uninstallResult.code}`
      log.warning(`openclaw plugins uninstall reported: ${detail}. Continuing with local cleanup.`)
    }
  } else {
    s.stop("Plugin removed by OpenClaw")
  }

  // 2. Defensive cleanup — `openclaw plugins uninstall` already strips the
  //    entry and plugins.allow on success, but if it failed above (enoent
  //    / non-zero) we still want our state out of openclaw.json. These
  //    are all idempotent.
  const cleanupSpinner = spinner()
  cleanupSpinner.start("Reverting openclaw.json")
  backupSettings()
  const post = readSettings()
  removePluginEntry(post)
  removeFromPluginsAllow(post)
  migrateLegacyEntries(post)
  writeSettings(post)
  cleanupSpinner.stop("Done")
  outro(pc.green("✓ Uninstalled"))
}
