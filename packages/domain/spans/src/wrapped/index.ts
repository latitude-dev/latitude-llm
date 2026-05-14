/**
 * Generic Wrapped surface — type-agnostic plumbing (the persisted record
 * shape, the repository port, the run-for-project use case). Type-specific
 * pieces (Claude Code's report shape, queries, personality, etc.) live
 * under `./types/<type>/`.
 */

export type { WrappedReportRecord, WrappedReportType } from "./entities/wrapped-report-record.ts"
export { WRAPPED_REPORT_TYPES } from "./entities/wrapped-report-record.ts"
export {
  WrappedReportRepository,
  type WrappedReportRepositoryShape,
  type WrappedReportSummary,
} from "./ports/wrapped-report-repository.ts"
// Re-export the Claude Code type's surface from the generic barrel so most
// consumers (which only deal with claude_code today) don't need to import
// from two paths. When a second type lands, those consumers will switch
// to importing from the specific type's barrel.
export * from "./types/claude-code/index.ts"
export {
  type RunWrappedDeps,
  type RunWrappedInput,
  type RunWrappedResult,
  type RunWrappedSkippedReason,
  runWrappedUseCase,
  type WrappedEmailSender,
  type WrappedRenderedEmail,
} from "./use-cases/run-wrapped.ts"
