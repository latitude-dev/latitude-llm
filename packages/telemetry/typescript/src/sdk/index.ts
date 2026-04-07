export { capture } from "./context.ts"

export { initLatitude } from "./init.ts"
export type { InstrumentationType } from "./instrumentations.ts"
export { registerLatitudeInstrumentations } from "./instrumentations.ts"
export { LatitudeSpanProcessor } from "./processor.ts"
export {
  RedactSpanProcessor,
  type RedactSpanProcessorOptions,
} from "./redact.ts"
export type { SmartFilterFieldsInput, SmartFilterOptions } from "./span-filter.ts"
export {
  buildShouldExportSpan,
  buildShouldExportSpanFromFields,
  ExportFilterSpanProcessor,
  isDefaultExportSpan,
  isGenAiOrLlmAttributeSpan,
  isLatitudeInstrumentationSpan,
  RedactThenExportSpanProcessor,
} from "./span-filter.ts"
export type { ContextOptions, InitLatitudeOptions, LatitudeSpanProcessorOptions } from "./types.ts"
