import { CLAUDE_CODE_WRAPPED_FLAG, FeatureFlagRepository } from "@domain/feature-flags"
import { MembershipRepository, type MemberWithUser, OrganizationRepository } from "@domain/organizations"
import { ProjectRepository } from "@domain/projects"
import { generateId, type OrganizationId, type ProjectId, type WrappedReportId } from "@domain/shared"
import { Effect } from "effect"
import { WrappedReportRepository } from "../ports/wrapped-report-repository.ts"
import { CURRENT_REPORT_VERSION, type Report } from "../types/claude-code/entities/report.ts"
import { ClaudeCodeSpanReader } from "../types/claude-code/ports/claude-code-span-reader.ts"
import { buildReportUseCase } from "../types/claude-code/use-cases/build-report.ts"

export interface RunWrappedInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly windowStart: Date
  readonly windowEnd: Date
}

export type RunWrappedSkippedReason = "flag-off" | "no-activity"

export type RunWrappedResult =
  | {
      readonly status: "sent"
      readonly reportId: WrappedReportId
      readonly projectName: string
    }
  | { readonly status: "skipped"; readonly reason: RunWrappedSkippedReason }

/**
 * Returns the org owner's display name. Falls back to the org name if no
 * owner is in the member list (shouldn't normally happen, but defends in
 * depth so the persisted row's `owner_name` always has *something* to
 * render in the web view's greeting).
 */
const resolveOwnerName = (members: readonly MemberWithUser[], organizationName: string): string => {
  const owner = members.find((m) => m.role === "owner")
  return owner?.name?.trim() || organizationName
}

/**
 * Runs the per-project Wrapped pipeline: check the feature flag + activity,
 * build the report, and persist a `wrapped_reports` row. The downstream
 * fan-out (in-app notifications + per-recipient email) is the notification
 * pipeline's job — this use case only owns "compute + persist" and returns
 * the report id for the caller to plug into `request-wrapped-report-notifications`.
 *
 * Triggered by either the weekly cron fan-out or the backoffice button;
 * both paths publish the same `runForProject` task on the `wrapped` topic.
 *
 * Today the body is hardcoded to the `claude_code` type — it calls the
 * Claude-Code-specific span reader, builds a `Report` shaped accordingly,
 * and saves with `type: "claude_code"`. When a second Wrapped type lands,
 * this becomes a registry dispatch keyed on the task payload's `type`.
 *
 * Defense-in-depth: the feature flag is re-checked here even though the
 * cron pre-filters by it. The button doesn't pre-filter (the worker is
 * the single source of truth) and either trigger can race with a flip.
 */
export const runWrappedUseCase = Effect.fn("wrapped.runForProject")(function* (input: RunWrappedInput) {
  const flags = yield* FeatureFlagRepository
  const flagOn = yield* flags.isEnabledForOrganization(CLAUDE_CODE_WRAPPED_FLAG)
  if (!flagOn) {
    return { status: "skipped", reason: "flag-off" } satisfies RunWrappedResult
  }

  const reader = yield* ClaudeCodeSpanReader
  const sessions = yield* reader.countSessionsForProjectInWindow({
    organizationId: input.organizationId,
    projectId: input.projectId,
    from: input.windowStart,
    to: input.windowEnd,
  })
  if (sessions === 0) {
    return { status: "skipped", reason: "no-activity" } satisfies RunWrappedResult
  }

  const projectRepo = yield* ProjectRepository
  const membershipRepo = yield* MembershipRepository
  const organizationRepo = yield* OrganizationRepository
  const project = yield* projectRepo.findById(input.projectId)
  const organization = yield* organizationRepo.findById(input.organizationId)
  // Fetch the full member list to snapshot the org owner's display name
  // onto the persisted row (`owner_name` anchors the web view's greeting).
  // Recipient resolution + delivery happens downstream in the notification
  // pipeline — this use case no longer fans out emails itself.
  const members = yield* membershipRepo.listMembersWithUser(input.organizationId)

  const report: Report = yield* buildReportUseCase({
    project,
    organization: { id: organization.id, name: organization.name },
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
  })

  const reportRepo = yield* WrappedReportRepository
  const reportId = generateId<"WrappedReportId">()
  const now = new Date()
  yield* reportRepo.save({
    id: reportId,
    type: "claude_code",
    organizationId: input.organizationId,
    projectId: input.projectId,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    ownerName: resolveOwnerName(members, organization.name),
    reportVersion: CURRENT_REPORT_VERSION,
    report,
    createdAt: now,
    updatedAt: now,
  })

  return {
    status: "sent",
    reportId,
    projectName: project.name,
  } satisfies RunWrappedResult
})
