export { BACKGROUND, Instrumentation } from '$telemetry/core'
export type {
  CaptureOptions,
  ChatSpanOptions,
  EndCompletionSpanOptions,
  EndHttpSpanOptions,
  EndSpanOptions,
  EndToolSpanOptions,
  ErrorOptions,
  ExternalSpanOptions,
  PromptSpanOptions as PromptSegmentOptions,
  StartCompletionSpanOptions,
  StartHttpSpanOptions,
  StartSpanOptions,
  StartToolSpanOptions,
} from '$telemetry/instrumentations'
export * from './redact'
export * from './sdk'
