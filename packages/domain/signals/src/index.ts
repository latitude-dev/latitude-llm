// Browser-safe surface (types, ports, pure helpers, read use-cases) lives in `browser.ts`, which the
// web client bundles via the package's `browser` export condition. The server-only mutation
// use-cases below stay out of that bundle — they transitively pull server-only code (the judge
// template / @domain/ai) and are only ever run by the API and workers.
export * from "./browser.ts"
export {
  assembleSignalGenerationGrounding,
  type SignalGenerationGroundingResult,
} from "./signal-generation-grounding.ts"
export {
  buildSignalGenerationUserPrompt,
  SIGNAL_GENERATION_SYSTEM_PROMPT,
  type SignalGenerationGrounding,
  summarizePreviewVerdicts,
} from "./signal-generation-prompt.ts"
export {
  type GeneratedSignalDraft,
  generatedSignalDraftSchema,
  type MappedSignalDraft,
  mapGeneratedSignalDraft,
} from "./signal-generation-schema.ts"
export { generateSignalSlug } from "./slug.ts"
export {
  type BackfillSignalScoreEvidenceInput,
  type BackfillSignalScoreEvidenceResult,
  backfillSignalScoreEvidenceUseCase,
  type ClassifySignalScoreEvidenceInput,
  classifySignalScoreEvidenceUseCase,
} from "./use-cases/backfill-signal-score-evidence.ts"
export {
  type CreateSignalError,
  type CreateSignalInput,
  type CreateSignalResult,
  createSignalUseCase,
} from "./use-cases/create-signal.ts"
export {
  type DeleteSignalError,
  type DeleteSignalInput,
  type DeleteSignalResult,
  deleteSignalUseCase,
} from "./use-cases/delete-signal.ts"
export {
  type UpdateSignalError,
  type UpdateSignalInput,
  type UpdateSignalResult,
  updateSignalUseCase,
} from "./use-cases/update-signal.ts"
export {
  type UpdateSignalEvaluationError,
  type UpdateSignalEvaluationInput,
  type UpdateSignalEvaluationResult,
  updateSignalEvaluationUseCase,
} from "./use-cases/update-signal-evaluation.ts"
