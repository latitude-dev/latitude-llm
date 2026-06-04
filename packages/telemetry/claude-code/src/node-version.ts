export function buildVersionError(version: string): string | null {
  const parts = version.split(".")
  const major = parseInt(parts[0] ?? "0", 10)
  const minor = parseInt(parts[1] ?? "0", 10)
  if (major < 20 || (major === 20 && minor < 12)) {
    return (
      `[latitude-claude-code] Node.js ${version} is too old — requires >=20.12.\n` +
      `The Stop hook is failing silently. To fix, ensure the "node" on your PATH is v20.12+\n` +
      `before Claude Code runs this hook.\n` +
      `With nvm, update the hook command in ~/.claude/settings.json to prefix the PATH:\n` +
      `  "command": "PATH=\\"/home/<you>/.nvm/versions/node/v22.x.x/bin:$PATH\\" npx -y @latitude-data/claude-code-telemetry"\n`
    )
  }
  return null
}
