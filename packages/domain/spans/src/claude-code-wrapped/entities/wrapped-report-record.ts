import type { OrganizationId, ProjectId, WrappedReportId } from "@domain/shared"
import type { Report, ReportVersion } from "./report.ts"

/**
 * One persisted Claude Code Wrapped snapshot — the shape stored in
 * `claude_code_wrapped_reports` and resolved by `/cc-wrapped/<id>`.
 *
 * Rows are immutable. Re-running the pipeline for the same project + window
 * inserts a new row with a new id rather than mutating an existing one.
 */
export interface WrappedReportRecord {
  readonly id: WrappedReportId
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly windowStart: Date
  readonly windowEnd: Date
  /** Snapshot of the org owner's display name; used only by the web view's greeting. */
  readonly ownerName: string
  readonly reportVersion: ReportVersion
  readonly report: Report
  readonly createdAt: Date
  readonly updatedAt: Date
}
