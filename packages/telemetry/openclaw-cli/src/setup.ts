import { existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { cancel, confirm, intro, isCancel, log, note, outro, password, spinner, text } from "@clack/prompts"
import pc from "picocolors"
import { pathsFor, type ResolvedConfigDir, resolveConfigDir, type SettingsPaths } from "./config-dir.ts"
import { jsonDiff } from "./diff.ts"
import { compareCalver, getOpenclawVersion, MIN_OPENCLAW_VERSION, runOpenclaw } from "./openclaw-cli.ts"
import {
  addToPluginsAllow,
  backupSettings,
  hasLatitudePlugin,
  type LatitudePluginConfig,
  migrateLegacyEntries,
  type OpenClawSettings,
  PLUGIN_ID,
  readInstalledRuntimeVersion,
  readSettings,
  removeFromPluginsAllow,
  removePluginEntry,
  restoreBackup,
  setPluginEntry,
  writeSettings,
} from "./settings-file.ts"
import { readCliVersion } from "./version.ts"

/**
 * The runtime version this CLI installs. Lockstep with the runtime — bump
 * both packages in the same commit. The CLI's npm-spec install is pinned to
 * this exact version (not a floating tag), so we never accidentally install
 * a runtime that doesn't match the contract this CLI was built against.
 *
 * Pinning also satisfies OpenClaw's `Pin install specs to exact versions`
 * supply-chain audit warning automatically.
 */
const RUNTIME_PACKAGE_NAME = "@latitude-data/openclaw-telemetry"
const RUNTIME_VERSION = "0.0.7"

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
  /** Override for the OpenClaw config directory. */
  openclawDir?: string | undefined
  /** When true, render the diff and the install spec without making any changes. */
  dryRun?: boolean
  /**
   * Restart-the-gateway behaviour:
   *   - `"force"`   (--restart): always restart, even non-TTY.
   *   - `"never"`   (--no-restart): never restart, even on TTY.
   *   - `"auto"`    (default): prompt on TTY, skip otherwise.
   */
  restart?: "force" | "never" | "auto"
  noPrompt?: boolean
  yes?: boolean
}

/**
 * Flags that take a value (either `--key=value` or `--key value`). Bare
 * `--key` is reserved for booleans and shouldn't consume the next argv
 * token as its value — operators expect `--no-content` next to `--yes`
 * to mean two booleans, not "no-content takes the value `--yes`".
 */
const VALUE_FLAGS = new Set(["api-key", "project", "openclaw-dir"])

export function parseFlags(argv: string[]): {
  subcommand: string | undefined
  flags: Record<string, string | boolean>
} {
  const [subcommand, ...rest] = argv
  const flags: Record<string, string | boolean> = {}
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (!arg || !arg.startsWith("--")) continue
    const eq = arg.indexOf("=")
    if (eq >= 0) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1)
      continue
    }
    const key = arg.slice(2)
    const next = rest[i + 1]
    // Space-separated form (`--key value`): only consume the next token
    // when the key is in VALUE_FLAGS and the next token isn't itself a
    // flag. This matches the standard convention everyone expects from
    // CLIs, while keeping bare boolean flags from accidentally swallowing
    // adjacent flags as values.
    if (VALUE_FLAGS.has(key) && next !== undefined && !next.startsWith("--")) {
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

  let restart: "force" | "never" | "auto" = "auto"
  if (flags["no-restart"] === true) restart = "never"
  if (flags.restart === true) {
    if (flags["no-restart"] === true) throw new Error("--restart and --no-restart are mutually exclusive")
    restart = "force"
  }

  return {
    apiKey: typeof flags["api-key"] === "string" ? flags["api-key"] : undefined,
    project: typeof flags.project === "string" ? flags.project : undefined,
    environment,
    allowConversationAccess,
    noTrust: flags["no-trust"] === true,
    openclawDir: typeof flags["openclaw-dir"] === "string" ? flags["openclaw-dir"] : undefined,
    dryRun: flags["dry-run"] === true,
    restart,
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

function resolvePaths(flags: InstallFlags): { resolved: ResolvedConfigDir; paths: SettingsPaths } {
  const resolved = resolveConfigDir({ flag: flags.openclawDir })
  return { resolved, paths: pathsFor(resolved.dir) }
}

function envForSubprocess(paths: SettingsPaths): NodeJS.ProcessEnv {
  // Pass OPENCLAW_HOME to the subprocess so its own resolution lines up
  // with ours. Caveat documented in config-dir.ts — at the time of writing
  // OpenClaw's CLI doesn't advertise OPENCLAW_HOME support; the post-write
  // `openclaw config validate --json` step catches a config-dir mismatch.
  return { OPENCLAW_HOME: paths.configDir }
}

async function runInteractiveInstall(flags: InstallFlags): Promise<void> {
  intro(pc.bgCyan(pc.black(" Latitude · OpenClaw telemetry ")))

  // Bail before any prompts if the host OpenClaw is too old. We'd rather
  // tell the user to upgrade than walk them through a config we can't make
  // work on their version.
  ensureOpenclawIsCompatible()

  const { resolved, paths } = resolvePaths(flags)
  log.info(`Using config dir: ${pc.dim(paths.configDir)} ${pc.dim(`(source: ${resolved.source})`)}`)

  // Lockstep contract check. If the runtime version we're built against
  // isn't on npm yet (half-published release), abort with a clear upgrade
  // path before we waste any of the operator's time on prompts.
  await ensureRuntimeOnNpm()

  // Render the upgrade UX before any spawn. Reads OpenClaw's own install
  // record so the version is what's *actually* running, not what was last
  // hand-edited into openclaw.json.
  const installedVersion = readInstalledRuntimeVersion(paths.installsPath)
  if (installedVersion !== undefined) {
    if (installedVersion === RUNTIME_VERSION) {
      log.info(`${PLUGIN_ID} ${pc.dim(installedVersion)} already installed — re-applying (idempotent).`)
    } else {
      log.info(`Upgrading ${PLUGIN_ID} from ${pc.dim(installedVersion)} → ${pc.cyan(RUNTIME_VERSION)}`)
    }
  }

  const existing = readSettings(paths.settingsPath)
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
    paths,
    dryRun: flags.dryRun === true,
  })

  if (!flags.dryRun) {
    await maybeRestartGateway(flags.restart ?? "auto", paths)
  }

  note(
    [
      flags.dryRun ? "Dry-run only — nothing was written." : "Plugin installed and configured.",
      `View your traces at  ${pc.cyan(urls.projectView(project))}`,
    ].join("\n"),
    "Next step",
  )
  outro(flags.dryRun ? pc.dim("(dry-run)") : pc.green("✓ Installed"))
}

async function runFlagDrivenInstall(flags: InstallFlags): Promise<void> {
  ensureOpenclawIsCompatible()
  const { resolved, paths } = resolvePaths(flags)
  process.stdout.write(`Using config dir: ${paths.configDir} (source: ${resolved.source})\n`)
  await ensureRuntimeOnNpm()

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
    paths,
    dryRun: flags.dryRun === true,
  })
  if (flags.dryRun) {
    process.stdout.write("Dry-run only — nothing was written.\n")
    return
  }
  await maybeRestartGateway(flags.restart ?? "auto", paths)
  process.stdout.write(`Installed Latitude plugin in ${paths.settingsPath}\n`)
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
  paths: SettingsPaths
  dryRun: boolean
}

async function applyChanges({
  apiKey,
  project,
  envConfig,
  allowConversationAccess,
  noTrust,
  paths,
  dryRun,
}: ApplyParams): Promise<void> {
  const installSpec = `${RUNTIME_PACKAGE_NAME}@${RUNTIME_VERSION}`

  // Build the proposed post-install settings without writing them. The
  // dry-run path uses this directly; the real path writes the same value.
  const before = readSettings(paths.settingsPath)
  const after = structuredClone(before) as OpenClawSettings
  migrateLegacyEntries(after)
  setPluginEntry(after, {
    apiKey,
    project,
    baseUrl: envConfig.name === "production" ? undefined : envConfig.ingest,
    allowConversationAccess,
  })
  if (!noTrust) addToPluginsAllow(after)

  if (dryRun) {
    log.info(`Would run: ${pc.dim(`openclaw plugins install ${installSpec} --force`)}`)
    const diff = jsonDiff(before, after, { fromLabel: paths.settingsPath, toLabel: `${paths.settingsPath} (proposed)` })
    if (diff.length > 0) {
      process.stdout.write(`${diff}\n`)
    } else {
      log.info(`No openclaw.json changes — current config already matches.`)
    }
    return
  }

  // 1. Take the backup BEFORE openclaw plugins install touches openclaw.json
  //    so it represents the user's true pre-install state. `openclaw plugins
  //    install` creates plugins.entries[id], so backing up after would lose
  //    the original "no entry" state and make recovery harder if any later
  //    step fails.
  ensureSettingsDir(paths)
  backupSettings(paths.settingsPath, paths.settingsBackupPath)

  // 2. Hand placement off to OpenClaw via the npm-spec form. OpenClaw fetches
  //    the package from npm, runs its install-time security scan, copies
  //    files into <configDir>/extensions/<encoded-id>/, writes the install
  //    record into <configDir>/plugins/installs.json, and creates a (disabled,
  //    configless) plugins.entries[id] in openclaw.json. We layer config +
  //    hooks + allow on top in step 3. --force lets us overwrite an existing
  //    install (e.g. when re-running on top of a previous version).
  const installSpinner = spinner()
  installSpinner.start(`Installing plugin via openclaw plugins install ${installSpec}`)
  const installResult = runOpenclaw(["plugins", "install", installSpec, "--force"], {
    timeoutMs: 60_000,
    env: envForSubprocess(paths),
  })
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

  // 3. Layer our config, hooks, and (optionally) plugins.allow on top of the
  //    entry OpenClaw just created. Atomic write — temp + rename — combined
  //    with the .latitude-bak backup means a SIGTERM mid-write can never
  //    leave openclaw.json in a half-serialized state.
  //
  // Snapshot the post-`openclaw plugins install` state for rollback. The
  // pre-install backup at `.latitude-bak` covers the typical case where
  // openclaw.json existed before our flow, but `backupSettings` is a no-op
  // when there's no source file to copy — that's fresh installs (no prior
  // openclaw.json). For those, the post-install state captured here is the
  // valid rollback target: it reflects exactly what `openclaw plugins
  // install` produced, which is always schema-valid (a disabled
  // plugins.entries[id] block + whatever else OpenClaw bootstrapped).
  const postInstallSnapshot = readSettings(paths.settingsPath)

  const settingsSpinner = spinner()
  settingsSpinner.start("Updating openclaw.json")
  const settings = readSettings(paths.settingsPath)
  migrateLegacyEntries(settings)
  setPluginEntry(settings, {
    apiKey,
    project,
    baseUrl: envConfig.name === "production" ? undefined : envConfig.ingest,
    allowConversationAccess,
    // `debug` intentionally not passed — `setPluginEntry` preserves
    // hand-edited values; fresh installs leave the key absent (runtime
    // default is `false`).
  })
  if (!noTrust) {
    addToPluginsAllow(settings)
  }
  writeSettings(paths.settingsPath, settings)
  settingsSpinner.stop(`Updated ${paths.settingsPath}`)
  if (existsSync(paths.settingsBackupPath)) log.info(`Backup saved at ${pc.dim(paths.settingsBackupPath)}`)
  if (noTrust) {
    log.warning(
      `--no-trust set; OpenClaw will warn at every gateway start that ${PLUGIN_ID} is untrusted. Add it to plugins.allow yourself when you're ready.`,
    )
  }

  // 4. Validate. Catches schema regressions and config-dir mismatch (where
  //    OpenClaw didn't pick up our OPENCLAW_HOME and wrote the install
  //    record to a different file from where we wrote the entry) before the
  //    operator restarts the gateway and finds out the hard way.
  const validateSpinner = spinner()
  validateSpinner.start("Validating openclaw.json")
  const validateResult = runOpenclaw(["config", "validate", "--json"], {
    timeoutMs: 10_000,
    env: envForSubprocess(paths),
  })
  if (!validateResult.ok || isInvalidConfigPayload(validateResult.stdout)) {
    validateSpinner.stop("openclaw config validate failed")
    const rollback = rollbackSettings(paths, postInstallSnapshot)
    const detail =
      validateResult.ok === false
        ? validateResult.stderr.trim() || validateResult.stdout.trim() || `exit code ${validateResult.code}`
        : validateResult.stdout.trim() || "config validate reported invalid config"
    throw new Error(`openclaw config validate reported a problem after our changes:\n  ${detail}\n${rollback}`)
  }
  validateSpinner.stop("Config valid")
}

/**
 * Two-tier rollback for validation failures:
 *
 *   1. If `.latitude-bak` exists (typical case — operator had openclaw.json
 *      before this flow), restore from it. That's the user's true
 *      pre-install state.
 *   2. If `.latitude-bak` doesn't exist (fresh install — no openclaw.json
 *      pre-flow, so `backupSettings` no-op'd), write `postInstallSnapshot`
 *      back. That's the state immediately after `openclaw plugins install`
 *      and before any of our config layering — schema-valid, just a
 *      disabled plugin entry. Operator can re-run install or run
 *      `openclaw plugins uninstall` to fully revert OpenClaw's bookkeeping.
 *
 * Returns the human-readable recovery line to append to the thrown error.
 */
function rollbackSettings(paths: SettingsPaths, postInstallSnapshot: OpenClawSettings): string {
  if (existsSync(paths.settingsBackupPath)) {
    const restored = restoreBackup(paths.settingsPath, paths.settingsBackupPath)
    return restored
      ? `Backup restored from ${paths.settingsBackupPath} — your config is back to the pre-install state.`
      : `Backup at ${paths.settingsBackupPath} could not be restored automatically; restore it manually.`
  }
  // Fresh-install path: write the post-install snapshot back. Atomic, same
  // as the install write.
  try {
    writeSettings(paths.settingsPath, postInstallSnapshot)
    return (
      `${paths.settingsPath} rolled back to the post-\`openclaw plugins install\` state ` +
      `(plugin entry exists but disabled). Run \`openclaw plugins uninstall ${PLUGIN_ID} --force\` ` +
      "to fully revert if you don't intend to retry."
    )
  } catch (err) {
    return (
      `Couldn't roll back ${paths.settingsPath} (${String(err)}). ` +
      `Run \`openclaw plugins uninstall ${PLUGIN_ID} --force\` and inspect the file manually.`
    )
  }
}

/** Best-effort detection of `{"valid": false, ...}` in the validate output. */
function isInvalidConfigPayload(stdout: string): boolean {
  const trimmed = stdout.trim()
  if (!trimmed) return false
  try {
    const parsed = JSON.parse(trimmed) as { valid?: unknown }
    return parsed.valid === false
  } catch {
    // Validator may print non-JSON banners — if exit code was 0, treat as valid.
    return false
  }
}

function ensureSettingsDir(paths: SettingsPaths): void {
  const dir = dirname(paths.settingsPath)
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
 * Lockstep contract check. The CLI installs a pinned `RUNTIME_VERSION`; if
 * that version isn't published yet (half-released release pipeline), abort
 * with a clear upgrade path so the operator's gateway doesn't end up with a
 * runtime that doesn't match this CLI's expectations.
 *
 * Best-effort — uses the npm registry's HTTP API rather than spawning
 * `npm view` so we don't require npm to be on PATH. Network failure
 * (offline) → warn-and-continue; the install spawn would fail visibly
 * anyway if the package wasn't there.
 */
async function ensureRuntimeOnNpm(): Promise<void> {
  const url = `https://registry.npmjs.org/${encodeURIComponent(RUNTIME_PACKAGE_NAME)}/${encodeURIComponent(RUNTIME_VERSION)}`
  try {
    const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(5_000) })
    if (res.status === 404) {
      cancel(
        `CLI ${readCliVersion()} expects ${RUNTIME_PACKAGE_NAME}@${RUNTIME_VERSION} but npm doesn't have that exact version. ` +
          `Upgrade the CLI: npm install -g @latitude-data/openclaw-telemetry-cli@latest`,
      )
      process.exit(1)
    }
    if (!res.ok) {
      log.warning(`npm registry check returned HTTP ${res.status}; continuing.`)
    }
  } catch (err) {
    // Offline / DNS / timeout — the install spawn will surface any real
    // problem.
    log.warning(`Couldn't reach npm registry to verify ${RUNTIME_PACKAGE_NAME}@${RUNTIME_VERSION}: ${String(err)}`)
  }
}

/**
 * Restart the OpenClaw gateway, prompting on TTY by default. The behaviour
 * is governed by `flags.restart`:
 *
 *   - `"force"` (--restart): always restart, even non-TTY. CI escape hatch.
 *   - `"never"` (--no-restart): never restart, even on TTY.
 *   - `"auto"` (default): prompt on TTY ("Restart now? [Y/n]"); skip
 *     non-TTY (and print the manual command). Hybrid that keeps interactive
 *     UX safe while CI defaults to leaving the operator in control.
 */
async function maybeRestartGateway(mode: "force" | "never" | "auto", paths: SettingsPaths): Promise<void> {
  if (mode === "never") {
    log.info(`Skipping gateway restart (--no-restart). Run \`openclaw gateway restart\` when ready.`)
    return
  }

  let shouldRestart: boolean
  if (mode === "force") {
    shouldRestart = true
  } else {
    // "auto": prompt on TTY, skip non-TTY.
    if (process.stdin.isTTY !== true) {
      log.info(`Run \`openclaw gateway restart\` to load the plugin.`)
      return
    }
    const confirmed = await confirm({
      message: "Restart the OpenClaw gateway now to load the plugin?",
      initialValue: true,
    })
    if (isCancel(confirmed) || confirmed !== true) {
      log.info(`Run \`openclaw gateway restart\` when ready.`)
      return
    }
    shouldRestart = true
  }

  if (!shouldRestart) return

  log.warning("Restarting gateway. In-flight runs may be interrupted.")
  const restartSpinner = spinner()
  restartSpinner.start("openclaw gateway restart")
  const restartResult = runOpenclaw(["gateway", "restart"], {
    timeoutMs: 60_000,
    env: envForSubprocess(paths),
  })
  if (!restartResult.ok) {
    restartSpinner.stop("Gateway restart failed")
    const detail = restartResult.stderr.trim() || restartResult.stdout.trim() || `exit code ${restartResult.code}`
    log.warning(`openclaw gateway restart failed: ${detail}. Restart it yourself when ready.`)
    return
  }
  restartSpinner.stop("Gateway restarted")
}

// ─── Uninstall ──────────────────────────────────────────────────────────────

interface UninstallFlags {
  noPrompt?: boolean
  openclawDir?: string | undefined
  restart?: "force" | "never" | "auto"
}

export function normalizeUninstallFlags(flags: Record<string, string | boolean>): UninstallFlags {
  let restart: "force" | "never" | "auto" = "auto"
  if (flags["no-restart"] === true) restart = "never"
  if (flags.restart === true) {
    if (flags["no-restart"] === true) throw new Error("--restart and --no-restart are mutually exclusive")
    restart = "force"
  }
  return {
    noPrompt: flags["no-prompt"] === true || flags.yes === true,
    openclawDir: typeof flags["openclaw-dir"] === "string" ? flags["openclaw-dir"] : undefined,
    restart,
  }
}

export async function runUninstall(flags: UninstallFlags = {}): Promise<void> {
  intro(pc.bgYellow(pc.black(" Latitude · OpenClaw telemetry — uninstall ")))

  const resolved = resolveConfigDir({ flag: flags.openclawDir })
  const paths = pathsFor(resolved.dir)
  log.info(`Using config dir: ${pc.dim(paths.configDir)} ${pc.dim(`(source: ${resolved.source})`)}`)

  const settings = readSettings(paths.settingsPath)
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
    `Backup of openclaw.json saved at ${paths.settingsBackupPath}`,
  ]
  note(plan.join("\n"), "Plan")

  if (!flags.noPrompt) {
    if (process.stdin.isTTY !== true) {
      // Symmetric with `runFlagDrivenInstall` requiring --api-key/--project
      // when non-TTY: there's no way for the operator to confirm a
      // destructive uninstall in a piped/CI invocation, so we refuse rather
      // than silently going ahead. `npx -y ...-cli uninstall` accidentally
      // landing inside a CI script otherwise wipes the plugin without any
      // confirming signal.
      throw new Error(
        "Non-interactive uninstall requires --yes / --no-prompt to confirm. Re-run with --yes to bypass the prompt explicitly.",
      )
    }
    const ok = await confirm({ message: "Proceed?", initialValue: true })
    if (isCancel(ok) || ok !== true) return onCancel()
  }

  // 1. Take the backup BEFORE openclaw plugins uninstall touches
  //    openclaw.json so it represents the user's true pre-uninstall state
  //    (entry + config + plugins.allow). Backing up after would capture
  //    the already-stripped state, defeating the point of the backup.
  backupSettings(paths.settingsPath, paths.settingsBackupPath)

  // 2. Hand uninstall to OpenClaw. It removes files, the install record,
  //    plugins.entries[id], plugins.allow, plugins.deny, plugins.load.paths
  //    — see src/plugins/uninstall.ts.
  const s = spinner()
  s.start("Reverting via openclaw plugins uninstall")
  const uninstallResult = runOpenclaw(["plugins", "uninstall", PLUGIN_ID, "--force"], {
    timeoutMs: 60_000,
    env: envForSubprocess(paths),
  })
  if (!uninstallResult.ok) {
    s.stop("openclaw plugins uninstall failed")
    if (uninstallResult.reason === "enoent") {
      log.warning(
        "`openclaw` not found on PATH. Falling back to local cleanup — files at <configDir>/extensions/ may remain.",
      )
    } else {
      const detail =
        uninstallResult.stderr.trim() || uninstallResult.stdout.trim() || `exit code ${uninstallResult.code}`
      log.warning(`openclaw plugins uninstall reported: ${detail}. Continuing with local cleanup.`)
    }
  } else {
    s.stop("Plugin removed by OpenClaw")
  }

  // 3. Defensive cleanup — `openclaw plugins uninstall` already strips the
  //    entry and plugins.allow on success, but if it failed above (enoent
  //    / non-zero) we still want our state out of openclaw.json. These
  //    are all idempotent.
  const cleanupSpinner = spinner()
  cleanupSpinner.start("Reverting openclaw.json")
  const post = readSettings(paths.settingsPath)
  removePluginEntry(post)
  removeFromPluginsAllow(post)
  migrateLegacyEntries(post)
  writeSettings(paths.settingsPath, post)
  cleanupSpinner.stop("Done")

  await maybeRestartGateway(flags.restart ?? "auto", paths)

  outro(pc.green("✓ Uninstalled"))
}
