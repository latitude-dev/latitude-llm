export {
  detectScriptCapabilities,
  hasEmbeddingCapability,
  hasLlmCapability,
  requiresEmbedding,
  resolveScriptCapabilities,
  SCRIPT_CAPABILITIES,
  type ScriptCapability,
} from "./capabilities.ts"
export {
  DEFAULT_EMBEDDING_SCRIPT_LIMITS,
  DEFAULT_LLM_SCRIPT_LIMITS,
  DEFAULT_PURE_SCRIPT_LIMITS,
  DEFAULT_SCRIPT_MEMORY_BYTES,
  DEFAULT_SCRIPT_SCORE_THRESHOLD,
  DEFAULT_SCRIPT_STACK_SIZE_BYTES,
  DETECTOR_HEALTH_DEGRADED_ERROR_RATE,
  DETECTOR_HEALTH_MIN_RUNS,
  DETECTOR_HEALTH_WINDOW_SECONDS,
  type ScriptRunLimits,
} from "./constants.ts"
export { isScoreMatch, type RunResult, runResultSchema, type ScriptScore, scriptScoreSchema } from "./contract.ts"
export {
  HostCallError,
  SCRIPT_LIMIT_KINDS,
  ScriptCompileError,
  ScriptLimitExceededError,
  type ScriptLimitKind,
  type ScriptRunError,
  ScriptRuntimeError,
} from "./errors.ts"
export {
  DETECTOR_OWNER_TYPES,
  type DetectorHealthSnapshot,
  DetectorHealthTracker,
  type DetectorHealthTrackerShape,
  type DetectorOwnerType,
  type DetectorRunRecord,
} from "./ports/detector-health.ts"
export {
  type CompiledScript,
  type CompileScriptInput,
  type HostLlmCall,
  type HostLlmFunction,
  type HostLlmResult,
  type HostSimilarityCall,
  type HostSimilarityFunction,
  type HostSimilarityResult,
  type ScriptConversationMessage,
  type ScriptCostBreakdown,
  type ScriptRunContext,
  type ScriptRunInput,
  ScriptRuntime,
  type ScriptRuntimeShape,
  type ScriptSessionContext,
  type ScriptTokenBreakdown,
  type ScriptToolContext,
  type ScriptTraceContext,
} from "./ports/script-runtime.ts"
export {
  type BaseSchemaDescriptor,
  buildSchemaFromDescriptor,
  type SchemaDescriptor,
  schemaDescriptorSchema,
} from "./schema-descriptor.ts"
export { minimalScriptSession } from "./script-session.ts"
