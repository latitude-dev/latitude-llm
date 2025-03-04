export type EnvVarConfig = {
  label: string
  description?: string
  placeholder?: string
  required: boolean
}

export type HostedIntegrationConfig<
  T extends Record<string, EnvVarConfig> = {},
> = {
  description?: string
  env: T
  commandFn: (env: { [K in keyof T]: string }) => string
}
