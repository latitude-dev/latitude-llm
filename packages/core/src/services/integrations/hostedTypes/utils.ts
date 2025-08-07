export function uvxCommand({
  name,
  repository,
  args,
}: {
  name: string
  repository?: string
  args?: string
}): string {
  const fromRepo = repository
    ? `--from "git+${repository}${repository.endsWith('.git') ? '' : '.git'}"`
    : ''
  const command = ['uvx', ...(repository ? [fromRepo] : []), name, ...(args ? [args] : [])].join(
    ' ',
  )
  return command.trim()
}
export function npxCommand({ package: pkg, args }: { package: string; args?: string }): string {
  return `npx -y ${pkg} ${args ?? ''}`.trim()
}
