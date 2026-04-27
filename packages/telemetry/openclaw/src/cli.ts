import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { normalizeInstallFlags, parseFlags, runInstall, runUninstall } from "./setup.ts"

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
  --yes / --no-prompt   Skip all prompts (required for non-TTY / CI)
`

function readVersion(): string {
  // dist/cli.js → ../package.json
  const here = dirname(fileURLToPath(import.meta.url))
  const pkgPath = join(here, "..", "package.json")
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string }
    return pkg.version ?? "unknown"
  } catch {
    return "unknown"
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  // Top-level --version / --help are handled before parseFlags so users can
  // type them as the first arg without hitting the "unknown subcommand" path.
  if (argv[0] === "--version" || argv[0] === "-v") {
    process.stdout.write(`${readVersion()}\n`)
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
    await runUninstall({ noPrompt: flags["no-prompt"] === true || flags.yes === true })
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
