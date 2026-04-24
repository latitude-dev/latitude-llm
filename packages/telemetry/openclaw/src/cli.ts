import { normalizeInstallFlags, parseFlags, runInstall, runUninstall } from "./setup.ts"

async function main(): Promise<void> {
  const { subcommand, flags } = parseFlags(process.argv.slice(2))
  if (subcommand === "install" || subcommand === undefined) {
    await runInstall(normalizeInstallFlags(flags))
    return
  }
  if (subcommand === "uninstall") {
    await runUninstall({ noPrompt: flags["no-prompt"] === true || flags.yes === true })
    return
  }
  process.stderr.write(`unknown subcommand: ${subcommand}\n`)
  process.stderr.write(
    "usage: latitude-openclaw [install|uninstall] [--api-key=...] [--project=...] [--staging|--dev] [--yes]\n",
  )
  process.exit(1)
}

main().catch((err) => {
  process.stderr.write(`${String(err)}\n`)
  process.exit(1)
})
