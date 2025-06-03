export interface BaseInstrumentation {
  isEnabled(): boolean
  enable(): void
  disable(): void
}
