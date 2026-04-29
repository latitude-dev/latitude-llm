import { readdir, readFile, stat } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { render } from "ink"
import { createElement } from "react"
import type { SerializedAuditTrail } from "../optimize/audit-trail.ts"
import { ReviewView } from "../optimize/ui/ReviewView.tsx"
import { resolveTargets, targetPath } from "../runner/targets.ts"

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const OPTIMIZATIONS_ROOT = join(PKG_ROOT, "optimizations")

interface ReviewArgs {
  readonly auditPath: string | undefined
  readonly targetId: string | undefined
}

const main = async (): Promise<void> => {
  const args = parseCli()
  const auditPath = await resolveAuditPath(args)
  const audit = await loadAudit(auditPath)
  const app = render(createElement(ReviewView, { audit }))
  await app.waitUntilExit()
}

const parseCli = (): ReviewArgs => {
  const { values, positionals } = parseArgs({
    options: {
      target: { type: "string" },
      help: { type: "boolean", default: false },
    },
    allowPositionals: true,
  })
  if (values.help === true) {
    console.log(USAGE)
    process.exit(0)
  }
  return {
    auditPath: positionals[0],
    targetId: values.target,
  }
}

const USAGE = `usage: pnpm --filter @tools/ai-benchmarks benchmark:optimize:review [audit-path] [options]

  audit-path                path to a <timestamp>.json audit produced by benchmark:optimize.
                            Default: most recent audit for --target.
  --target <id>             target id to scan for the most recent audit (e.g. flaggers:jailbreaking).
                            Required when audit-path is not given.

Keyboard:
  ↑/↓ or j/k      navigate iterations / scroll detail
  Enter           drill into iteration
  Esc/Backspace   back to list
  [ ] / PgUp PgDn page scroll
  q               quit
`

const resolveAuditPath = async (args: ReviewArgs): Promise<string> => {
  if (args.auditPath !== undefined) {
    await stat(args.auditPath)
    return args.auditPath
  }
  if (args.targetId === undefined) {
    console.error("either provide an audit path argument or --target <id>")
    console.error(USAGE)
    process.exit(1)
  }
  const targets = resolveTargets([args.targetId])
  const target = targets[0]
  if (targets.length !== 1 || target === undefined) {
    console.error(`--target ${args.targetId} matched ${targets.length} targets, expected 1`)
    process.exit(1)
  }
  const dir = join(OPTIMIZATIONS_ROOT, targetPath(target.id))
  let entries: readonly string[]
  try {
    entries = await readdir(dir)
  } catch {
    console.error(`no audits found at ${dir}`)
    process.exit(1)
  }
  // Match `<timestamp>.json` (the run audit). Skip `<timestamp>-debug.log`
  // and `<timestamp>-crash.json`.
  const candidates = entries.filter((name) => name.endsWith(".json") && !name.endsWith("-crash.json")).sort()
  const newest = candidates[candidates.length - 1]
  if (newest === undefined) {
    console.error(`no <timestamp>.json audits in ${dir}`)
    process.exit(1)
  }
  return join(dir, newest)
}

const loadAudit = async (path: string): Promise<SerializedAuditTrail> => {
  const raw = await readFile(path, "utf8")
  return JSON.parse(raw) as SerializedAuditTrail
}

await main()
