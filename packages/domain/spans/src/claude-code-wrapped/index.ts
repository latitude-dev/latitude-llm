export {
  CURRENT_REPORT_VERSION,
  type FileLine,
  type LocStats,
  PERSONALITY_KINDS,
  type Personality,
  type PersonalityKind,
  REPORT_VERSIONS,
  type Report,
  type ReportV1,
  type ReportVersion,
  SCHEMA_BY_VERSION,
  TOOL_BUCKETS,
  type ToolBucket,
  type ToolMix,
  type TopBashCommand,
  type WorkspaceDeepDive,
} from "./entities/report.ts"
export type { WrappedReportRecord } from "./entities/wrapped-report-record.ts"
export { pickReadAnchor, pickWrittenAnchor } from "./helpers/anchors.ts"
export {
  type BashPatternRow,
  type BiggestWriteRow,
  type BranchRow,
  type BusiestDayRow,
  ClaudeCodeSpanReader,
  type ClaudeCodeSpanReaderShape,
  type FileTouchesRow,
  type HeatmapCellRow,
  type LocStatsRow,
  type OrgProjectPair,
  type ProjectWindowInput,
  type SessionDurationStatsRow,
  type ToolMixRow,
  type WindowInput,
  type WorkspaceDeepDiveRow,
  type WorkspaceRow,
  type WrappedTotalsRow,
} from "./ports/claude-code-span-reader.ts"
export { WrappedReportRepository, type WrappedReportRepositoryShape } from "./ports/wrapped-report-repository.ts"
export {
  type AssembleReportInput,
  assembleReport,
  type BuildReportInput,
  buildReportUseCase,
  toolBucketFor,
} from "./use-cases/build-report.ts"
export { listProjectsWithClaudeCodeSpansUseCase } from "./use-cases/list-projects-with-claude-code-spans.ts"
export {
  type ClaudeCodeWrappedEmailSender,
  type ClaudeCodeWrappedRenderedEmail,
  type RunClaudeCodeWrappedDeps,
  type RunClaudeCodeWrappedInput,
  type RunClaudeCodeWrappedResult,
  type RunClaudeCodeWrappedSkippedReason,
  runClaudeCodeWrappedUseCase,
} from "./use-cases/run-claude-code-wrapped.ts"
