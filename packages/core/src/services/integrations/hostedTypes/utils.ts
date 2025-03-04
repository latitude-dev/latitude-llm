export function uvxCommand({
  name,
  repository,
  args,
}: {
  name: string
  repository: string
  args?: string
}): string {
  return `uvx --from "git+${repository}${repository.endsWith('.git') ? '' : '.git'}" ${name} ${args ?? ''}`.trim()
}
export function npxCommand({
  package: pkg,
  args,
}: {
  package: string
  args?: string
}): string {
  return `npx -y ${pkg} ${args ?? ''}`.trim()
}
