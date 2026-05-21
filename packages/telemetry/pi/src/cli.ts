import { normalizeInstallFlags, normalizeUninstallFlags, parseFlags, runInstall, runUninstall } from "./setup.ts"
import { packageVersion } from "./version.ts"

const usage = `usage: latitude-pi <command> [options]

commands:
  install               Install the pi extension and configure Latitude export
  uninstall             Remove the pi extension package entry and config
  --version, -v         Print the package version
  --help, -h            Print this message

install options:
  --api-key=<key>       Pass the Latitude API key non-interactively
  --project=<slug>      Pass the Latitude project slug non-interactively
  --staging             Target staging Latitude ingest
  --dev                 Target local Latitude ingest (http://localhost:3002)
  --base-url=<url>      Override the Latitude ingest base URL
  --no-content          Export structure/timing without prompts, responses, or tool I/O
  --allow-conversation  Force full content capture on
  --pi-dir=<path>       Override pi config dir (default: $PI_CODING_AGENT_DIR or ~/.pi/agent)
  --dry-run             Print the proposed settings/config and exit without writing
  --yes / --no-prompt   Skip prompts (required for non-TTY / CI)

uninstall options:
  --pi-dir=<path>       Override pi config dir
  --yes / --no-prompt   Skip the confirmation prompt
`

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  if (argv[0] === "--version" || argv[0] === "-v") {
    process.stdout.write(`${packageVersion}\n`)
    return
  }
  if (argv[0] === "--help" || argv[0] === "-h") {
    process.stdout.write(usage)
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
  process.stderr.write(usage)
  process.exit(1)
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`)
  process.exit(1)
})
