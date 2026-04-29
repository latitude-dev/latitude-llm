#!/usr/bin/env node
import { normalizeInstallFlags, normalizeUninstallFlags, parseFlags, runInstall, runUninstall } from "./setup.ts"
import { readCliVersion } from "./version.ts"

const USAGE = `usage: latitude-openclaw <command> [options]

commands:
  install               Install the plugin (interactive when stdin is a TTY)
  uninstall             Remove the plugin entry and files
  --version, -v         Print the package version
  --help, -h            Print this message

install options:
  --api-key=<key>       Pass the API key non-interactively
  --project=<slug>      Pass the project slug non-interactively
  --staging             Target https://staging.latitude.so / staging-ingest
  --dev                 Target http://localhost:3000 / 3002
  --no-content          Skip raw prompt/response/tool I/O capture
  --allow-conversation  Force conversation capture on (overrides existing config)
  --no-trust            Skip adding plugin id to plugins.allow
  --openclaw-dir=<path> Override OpenClaw config dir (default: $OPENCLAW_HOME, ./openclaw.json,
                        or ~/.openclaw — see resolution order in README)
  --dry-run             Show the diff against current openclaw.json and exit (no writes)
  --restart             Always restart the gateway, even non-TTY
  --no-restart          Never restart the gateway, even on TTY
  --yes / --no-prompt   Skip all prompts (required for non-TTY / CI)

uninstall options:
  --openclaw-dir=<path> Override OpenClaw config dir (same precedence as install)
  --restart             Always restart the gateway, even non-TTY
  --no-restart          Never restart the gateway, even on TTY
  --yes / --no-prompt   Skip the confirmation prompt
`

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  // Top-level --version / --help are handled before parseFlags so users can
  // type them as the first arg without hitting the "unknown subcommand" path.
  if (argv[0] === "--version" || argv[0] === "-v") {
    process.stdout.write(`${readCliVersion()}\n`)
    return
  }
  if (argv[0] === "--help" || argv[0] === "-h") {
    process.stdout.write(USAGE)
    return
  }

  const { subcommand, flags } = parseFlags(argv)
  if (subcommand === "install" || subcommand === undefined) {
    await runInstall(normalizeInstallFlags(flags))
    return
  }
  if (subcommand === "uninstall") {
    await runUninstall(normalizeUninstallFlags(flags))
    return
  }
  process.stderr.write(`unknown subcommand: ${subcommand}\n`)
  process.stderr.write(USAGE)
  process.exit(1)
}

main().catch((err) => {
  process.stderr.write(`${String(err)}\n`)
  process.exit(1)
})
