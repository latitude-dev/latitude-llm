import { CLAUDE_CODE_WRAPPED_FLAG, FeatureFlagRepository } from "@domain/feature-flags"
import { MembershipRepository, type MemberWithUser } from "@domain/organizations"
import { type Project, ProjectRepository } from "@domain/projects"
import type { OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import type { Report } from "../entities/report.ts"
import { ClaudeCodeSpanReader } from "../ports/claude-code-span-reader.ts"

/**
 * Builds a minimal but schema-valid `Report` while the rich ClickHouse
 * aggregations live in a follow-up commit. Zeros everywhere except the
 * session count, an empty 7×24 heatmap, and a default `surgeon` archetype
 * (the most common). This keeps the pipeline working end-to-end during the
 * transition; once `buildReportUseCase` lands, this helper goes away.
 */
const emptyHeatmap = (): Report["heatmap"] => Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))

const makeStubReport = (project: Project, input: RunClaudeCodeWrappedInput, sessions: number): Report => ({
  project: { id: project.id, name: project.name, slug: project.slug },
  organization: { id: input.organizationId, name: "" },
  window: { start: input.windowStart, end: input.windowEnd },
  totals: {
    sessions,
    toolCalls: 0,
    durationMs: 0,
    filesTouched: 0,
    commandsRun: 0,
    workspaces: 0,
    branches: 0,
    commits: 0,
    repos: 0,
  },
  toolMix: { bash: 0, read: 0, edit: 0, write: 0, search: 0, plan: 0, other: 0 },
  topFiles: [],
  topBashCommands: [],
  topWorkspaces: [],
  topBranches: [],
  workspaceDeepDives: [],
  otherWorkspaceCount: 0,
  heatmap: emptyHeatmap(),
  moments: { longestSession: null, busiestDay: null, mainCharacterFile: null },
  personality: {
    kind: "surgeon",
    score: 0,
    evidence: ["", "", ""],
  },
})

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
    const project = yield* projectRepo.findById(input.projectId)
    const members = yield* membershipRepo.listMembersWithUser(input.organizationId)
    const recipients = members.filter(isEligibleRecipient)
    if (recipients.length === 0) {
      return { status: "skipped", reason: "no-recipients" } satisfies RunClaudeCodeWrappedResult
    }

    // Stub report — schema is in place, but the rich aggregations are added
    // in a follow-up commit (build-report.ts). For now we emit a minimal but
    // valid Report so the rest of the pipeline keeps working end-to-end.
    const report: Report = makeStubReport(project, input, sessions)

    yield* Effect.forEach(recipients, renderForRecipient(deps, report), {
      concurrency: SEND_CONCURRENCY,
      discard: true,
    })

    return { status: "sent", recipientCount: recipients.length } satisfies RunClaudeCodeWrappedResult
  })
