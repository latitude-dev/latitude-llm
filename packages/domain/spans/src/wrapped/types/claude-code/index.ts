/**
 * Type-specific surface for Claude Code Wrapped — schema, queries,
 * personality, build pipeline. Future Wrapped types (Openclaw, Codex, …)
 * live in sibling folders under `../`.
 */

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
export {
  type AssembleReportInput,
  assembleReport,
  type BuildReportInput,
  buildReportUseCase,
  toolBucketFor,
} from "./use-cases/build-report.ts"
export { listProjectsWithClaudeCodeSpansUseCase } from "./use-cases/list-projects-with-claude-code-spans.ts"
