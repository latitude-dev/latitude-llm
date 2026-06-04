// Version check must run before any other import — @clack/prompts uses
// node:util styleText which only exists from Node.js 20.12 onward.
// In ESM the static imports at the top of index.ts are evaluated before
// any module body runs, so this file dynamically imports index.js after
// the check passes.
import { buildVersionError } from "./node-version.ts"

const error = buildVersionError(process.versions.node)
if (error) {
  process.stderr.write(error)
  process.exit(0) // fail-open — do not block Claude Code
}

try {
  await import("./index.js")
} catch (err) {
  process.stderr.write(`[latitude-claude-code] failed to load: ${String(err)}\n`)
  process.exit(0)
}
