export type EnvVarConfig = {
  label: string
  description?: string
  placeholder?: string
  required: boolean
}

export type HostedIntegrationConfig = {
  command: string
  env: Record<string, EnvVarConfig>
}
