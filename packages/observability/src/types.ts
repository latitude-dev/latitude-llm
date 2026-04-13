export type LogLevel = "info" | "warn" | "error"

export interface ObservabilityState {
  initialized: boolean
  enabled: boolean
  serviceName?: string
  environment?: string
  initialization?: Promise<void>
  shutdown?: () => Promise<void>
}

export interface InitializeObservabilityOptions {
  readonly serviceName: string
}

export interface TracesConfig {
  readonly endpoint: string
  readonly headers: Record<string, string>
}
