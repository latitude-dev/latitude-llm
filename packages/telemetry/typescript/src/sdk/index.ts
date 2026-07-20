export { GEN_AI_MEMORY_ATTRIBUTES, MEMORY_OPERATIONS } from "../constants/attributes.ts"
export { type CaptureScope, capture } from "./context.ts"
export { initLatitude, Latitude } from "./init.ts"
export type { InstrumentationName, InstrumentationsInput } from "./instrumentations.ts"
export { registerLatitudeInstrumentations } from "./instrumentations.ts"
export {
  createMemoryTelemetry,
  type MemoryOperation,
  type MemoryRecordInput,
  type MemoryRedactInfo,
  type MemoryTelemetry,
  type MemoryTelemetryOptions,
} from "./memory.ts"
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
export { getLatitudeTracer } from "./tracer.ts"
export type { ContextOptions, InitLatitudeOptions, LatitudeOptions, LatitudeSpanProcessorOptions } from "./types.ts"
