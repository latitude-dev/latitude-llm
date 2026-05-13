import { CLAUDE_CODE_WRAPPED_FLAG, FeatureFlagRepository } from "@domain/feature-flags"
import { MembershipRepository, type MemberWithUser, OrganizationRepository } from "@domain/organizations"
import { ProjectRepository } from "@domain/projects"
import type { OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import type { Report } from "../entities/report.ts"
import { ClaudeCodeSpanReader } from "../ports/claude-code-span-reader.ts"
import { buildReportUseCase } from "./build-report.ts"

/**
 * Minimal rendered-email shape — mirrors `RenderedEmail` from `@domain/email`
 * but kept local so this package doesn't pull in the email package's JSX
 * templates (which would force JSX configuration on every consumer).
 */
export interface ClaudeCodeWrappedRenderedEmail {
  readonly html: string
  readonly subject: string
  readonly text: string
}

/**
 * Minimal email-send callback — mirrors `SendEmail` from `@domain/email`
 * without the type-level error coupling.
 */
export type ClaudeCodeWrappedEmailSender = (email: {
  readonly to: string
  readonly subject: string
  readonly html: string
  readonly text: string
}) => Effect.Effect<void, unknown>

export interface RunClaudeCodeWrappedInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly windowStart: Date
  readonly windowEnd: Date
}

export interface RunClaudeCodeWrappedDeps {
  /**
   * Renders the email body for a single recipient. The worker passes the
   * template function from `@domain/email`; tests pass a fake that captures
   * the rendered output.
   */
  readonly renderEmail: (data: {
    readonly userName: string
    readonly report: Report
  }) => Promise<ClaudeCodeWrappedRenderedEmail>
  /**
   * Sends one rendered email. Typically the SendEmail use case from
   * `@domain/email`, wired by the worker with a real `EmailSender`.
   */
  readonly sendEmail: ClaudeCodeWrappedEmailSender
}

export type RunClaudeCodeWrappedSkippedReason = "flag-off" | "no-activity" | "no-recipients"

export type RunClaudeCodeWrappedResult =
  | { readonly status: "sent"; readonly recipientCount: number }
  | { readonly status: "skipped"; readonly reason: RunClaudeCodeWrappedSkippedReason }

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

const renderForRecipient = (deps: RunClaudeCodeWrappedDeps, report: Report) => (member: MemberWithUser) =>
  Effect.gen(function* () {
    const rendered = yield* Effect.tryPromise(() =>
      deps.renderEmail({ userName: member.name ?? "there", report }),
    ).pipe(
      Effect.mapError((cause) => new Error("Failed to render Claude Code Wrapped email", { cause: cause as Error })),
    )
    yield* deps.sendEmail({
      to: member.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    })
  })

/**
 * Runs the per-project Claude Code Wrapped pipeline. Triggered by either the
 * weekly cron fan-out or the backoffice button; both paths publish the same
 * `runForProject` task.
 *
 * Defense-in-depth: the feature flag is re-checked here even though the cron
 * pre-filters by it. The button doesn't pre-filter (the worker is the single
 * source of truth) and either trigger can race with a flag flip.
 */
export const runClaudeCodeWrappedUseCase = (deps: RunClaudeCodeWrappedDeps) =>
  Effect.fn("claude-code-wrapped.runForProject")(function* (input: RunClaudeCodeWrappedInput) {
    const flags = yield* FeatureFlagRepository
    const flagOn = yield* flags.isEnabledForOrganization(CLAUDE_CODE_WRAPPED_FLAG)
    if (!flagOn) {
      return { status: "skipped", reason: "flag-off" } satisfies RunClaudeCodeWrappedResult
    }

    const reader = yield* ClaudeCodeSpanReader
    const sessions = yield* reader.countSessionsForProjectInWindow({
      organizationId: input.organizationId,
      projectId: input.projectId,
      from: input.windowStart,
      to: input.windowEnd,
    })
    if (sessions === 0) {
      return { status: "skipped", reason: "no-activity" } satisfies RunClaudeCodeWrappedResult
    }

    const projectRepo = yield* ProjectRepository
    const membershipRepo = yield* MembershipRepository
    const organizationRepo = yield* OrganizationRepository
    const project = yield* projectRepo.findById(input.projectId)
    const organization = yield* organizationRepo.findById(input.organizationId)
    const members = yield* membershipRepo.listMembersWithUser(input.organizationId)
    const recipients = members.filter(isEligibleRecipient)
    if (recipients.length === 0) {
      return { status: "skipped", reason: "no-recipients" } satisfies RunClaudeCodeWrappedResult
    }

    const report: Report = yield* buildReportUseCase({
      project,
      organization: { id: organization.id, name: organization.name },
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
    })

    yield* Effect.forEach(recipients, renderForRecipient(deps, report), {
      concurrency: SEND_CONCURRENCY,
      discard: true,
    })

    return { status: "sent", recipientCount: recipients.length } satisfies RunClaudeCodeWrappedResult
  })
