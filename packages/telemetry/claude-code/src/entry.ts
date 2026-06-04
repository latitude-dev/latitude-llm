// Version check must run before any other import — @clack/prompts uses
// node:util styleText which only exists from Node.js 20.12 onward.
// In ESM the static imports at the top of index.ts are evaluated before
// any module body runs, so this file dynamically imports index.js after
// the check passes.
const parts = process.versions.node.split(".")
const major = parseInt(parts[0] ?? "0", 10)
const minor = parseInt(parts[1] ?? "0", 10)

if (major < 20 || (major === 20 && minor < 12)) {
  process.stderr.write(
    `[latitude-claude-code] Node.js ${process.versions.node} is too old — requires >=20.12.\n` +
      `The Stop hook is failing silently. To fix, ensure the "node" on your PATH is v20.12+\n` +
      `before Claude Code runs this hook.\n` +
      `With nvm, update the hook command in ~/.claude/settings.json to prefix the PATH:\n` +
      `  "command": "PATH=\\"/home/<you>/.nvm/versions/node/v22.x.x/bin:$PATH\\" npx -y @latitude-data/claude-code-telemetry"\n`,
  )
  process.exit(0) // fail-open — do not block Claude Code
}

await import("./index.js")
