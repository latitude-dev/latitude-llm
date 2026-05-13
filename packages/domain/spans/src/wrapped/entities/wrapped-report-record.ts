import type { OrganizationId, ProjectId, WrappedReportId } from "@domain/shared"
import type { Report, ReportVersion } from "../types/claude-code/entities/report.ts"

/**
 * Discriminator for the Wrapped row's source. Today the only value is
 * `"claude_code"`; future types (Openclaw, Codex, …) extend this union.
 *
 * String literal rather than an enum so it's narrowable in switches +
 * trivially serialisable across the wire / DB without a runtime helper.
 */
export const WRAPPED_REPORT_TYPES = ["claude_code"] as const
export type WrappedReportType = (typeof WRAPPED_REPORT_TYPES)[number]

/**
 * One persisted Wrapped snapshot — the shape stored in `wrapped_reports`
 * and resolved by `/wrapped/<id>`.
 *
 * Rows are immutable. Re-running the pipeline for the same project + window
 * inserts a new row with a new id rather than mutating an existing one.
 *
 * Today the `report` field is always shaped as Claude Code's `Report` since
 * `type` is always `"claude_code"`. When a second type is added, this
 * becomes a discriminated union; consumers will narrow on `type +
 * reportVersion` before rendering.
 */
export interface WrappedReportRecord {
  readonly id: WrappedReportId
  /** Source of the report data; future types live alongside `claude_code`. */
  readonly type: WrappedReportType
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
