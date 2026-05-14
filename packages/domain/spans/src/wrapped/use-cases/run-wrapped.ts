import { CLAUDE_CODE_WRAPPED_FLAG, FeatureFlagRepository } from "@domain/feature-flags"
import { MembershipRepository, type MemberWithUser, OrganizationRepository } from "@domain/organizations"
import { ProjectRepository } from "@domain/projects"
import { generateId, type OrganizationId, type ProjectId, type WrappedReportId } from "@domain/shared"
import { Effect } from "effect"
import { WrappedReportRepository } from "../ports/wrapped-report-repository.ts"
import { CURRENT_REPORT_VERSION, type Report } from "../types/claude-code/entities/report.ts"
import { ClaudeCodeSpanReader } from "../types/claude-code/ports/claude-code-span-reader.ts"
import { buildReportUseCase } from "../types/claude-code/use-cases/build-report.ts"

/**
 * Minimal rendered-email shape — mirrors `RenderedEmail` from `@domain/email`
 * but kept local so this package doesn't pull in the email package's JSX
 * templates (which would force JSX configuration on every consumer).
 */
export interface WrappedRenderedEmail {
  readonly html: string
  readonly subject: string
  readonly text: string
}

/**
 * Minimal email-send callback — mirrors `SendEmail` from `@domain/email`
 * without the type-level error coupling.
 */
export type WrappedEmailSender = (email: {
  readonly to: string
  readonly subject: string
  readonly html: string
  readonly text: string
}) => Effect.Effect<void, unknown>

export interface RunWrappedInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly windowStart: Date
  readonly windowEnd: Date
}

export interface RunWrappedDeps {
  /**
   * Renders the email body for a single recipient. The worker passes the
   * template function from `@domain/email`; tests pass a fake that captures
   * the rendered output. `reportId` is the persisted report's id — the
   * template uses it to build the "See your full week →" CTA URL.
   */
  readonly renderEmail: (data: {
    readonly userName: string
    readonly report: Report
    readonly reportId: WrappedReportId
  }) => Promise<WrappedRenderedEmail>
  /**
   * Sends one rendered email. Typically the SendEmail use case from
   * `@domain/email`, wired by the worker with a real `EmailSender`.
   */
  readonly sendEmail: WrappedEmailSender
}

export type RunWrappedSkippedReason = "flag-off" | "no-activity" | "no-recipients"

export type RunWrappedResult =
  | {
      readonly status: "sent"
      readonly recipientCount: number
      readonly reportId: WrappedReportId
      readonly projectName: string
    }
  | { readonly status: "skipped"; readonly reason: RunWrappedSkippedReason }

/**
 * Concurrency cap for fan-out sends. Keeps a single run from saturating the
 * email transport pool when an organization has many members.
 */
const SEND_CONCURRENCY = 5

/**
 * Selects eligible recipients for the Wrapped email — verified-email members
 * only. Per-user opt-out preferences would slot in here once that schema
 * lands.
 */
const isEligibleRecipient = (member: MemberWithUser): boolean => member.emailVerified

const renderForRecipient =
  (deps: RunWrappedDeps, report: Report, reportId: WrappedReportId) => (member: MemberWithUser) =>
    Effect.gen(function* () {
      const rendered = yield* Effect.tryPromise(() =>
        deps.renderEmail({ userName: member.name ?? "there", report, reportId }),
      ).pipe(Effect.mapError((cause) => new Error("Failed to render Wrapped email", { cause: cause as Error })))
      yield* deps.sendEmail({
        to: member.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      })
    })

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
 * Runs the per-project Wrapped pipeline. Triggered by either the weekly
 * cron fan-out or the backoffice button; both paths publish the same
 * `runForProject` task on the `wrapped` topic.
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
export const runWrappedUseCase = (deps: RunWrappedDeps) =>
  Effect.fn("wrapped.runForProject")(function* (input: RunWrappedInput) {
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
    const members = yield* membershipRepo.listMembersWithUser(input.organizationId)
    const recipients = members.filter(isEligibleRecipient)
    if (recipients.length === 0) {
      return { status: "skipped", reason: "no-recipients" } satisfies RunWrappedResult
    }

    const report: Report = yield* buildReportUseCase({
      project,
      organization: { id: organization.id, name: organization.name },
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
    })

    // Persist *before* sending emails so the CTA the email links to
    // resolves the moment any recipient clicks it. Failures here are real
    // failures — we don't want to send "See your full week →" links that
    // 404 because the row never landed.
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
      // Resolve from the full member list, not `recipients` — the org owner
      // may not have a verified email but their name still anchors the
      // greeting on the public report.
      ownerName: resolveOwnerName(members, organization.name),
      reportVersion: CURRENT_REPORT_VERSION,
      report,
      createdAt: now,
      updatedAt: now,
    })

    yield* Effect.forEach(recipients, renderForRecipient(deps, report, reportId), {
      concurrency: SEND_CONCURRENCY,
      discard: true,
    })

    return {
      status: "sent",
      recipientCount: recipients.length,
      reportId,
      projectName: project.name,
    } satisfies RunWrappedResult
  })
