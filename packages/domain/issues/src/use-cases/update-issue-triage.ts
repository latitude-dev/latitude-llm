import { OutboxEventWriter } from "@domain/events"
import { MembershipRepository } from "@domain/organizations"
import {
  BadRequestError,
  type ConcurrentSqlTransactionError,
  cuidSchema,
  issueIdSchema,
  type NotFoundError,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  SqlClient,
} from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import { type Issue, type IssuePriority, issuePrioritySchema } from "../entities/issue.ts"
import { IssueRepository } from "../ports/issue-repository.ts"

const updateIssueTriageInputSchema = z.object({
  projectId: cuidSchema.transform(ProjectId),
  issueId: issueIdSchema,
  /** User performing the edit — carried on `IssueAssigneeChanged` so consumers can skip self-assignments. */
  actorUserId: cuidSchema,
  // `undefined` (key omitted) leaves the field unchanged; explicit `null` clears it; a value sets it.
  assigneeId: cuidSchema.nullable().optional(),
  priority: issuePrioritySchema.nullable().optional(),
  now: z.date().optional(),
})

export type UpdateIssueTriageInput = z.input<typeof updateIssueTriageInputSchema>

export interface UpdateIssueTriageResult {
  readonly issueId: string
  readonly assigneeId: string | null
  readonly priority: IssuePriority | null
  readonly updatedAt: Date
  readonly changed: boolean
}

export type UpdateIssueTriageError = BadRequestError | ConcurrentSqlTransactionError | NotFoundError | RepositoryError

const toResult = (issue: Issue, changed: boolean): UpdateIssueTriageResult => ({
  issueId: issue.id,
  assigneeId: issue.assigneeId,
  priority: issue.priority,
  updatedAt: issue.updatedAt,
  changed,
})

export const updateIssueTriageUseCase = (input: UpdateIssueTriageInput) =>
  Effect.gen(function* () {
    const parsed = updateIssueTriageInputSchema.parse(input)
    yield* Effect.annotateCurrentSpan("projectId", String(parsed.projectId))
    yield* Effect.annotateCurrentSpan("issueId", parsed.issueId)
    const sqlClient = yield* SqlClient
    const now = parsed.now ?? new Date()

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const issueRepository = yield* IssueRepository
        const membershipRepository = yield* MembershipRepository
        const issue = yield* issueRepository.findByIdForUpdate(parsed.issueId)

        if (issue.projectId !== parsed.projectId) {
          return yield* new BadRequestError({
            message: `Issue ${issue.id} does not belong to project ${parsed.projectId}`,
          })
        }

        // A non-null assignee must be a confirmed member of the issue's organization.
        // Clearing the assignee (explicit null) skips the check.
        if (parsed.assigneeId !== undefined && parsed.assigneeId !== null) {
          const isMember = yield* membershipRepository.isMember(OrganizationId(issue.organizationId), parsed.assigneeId)
          if (!isMember) {
            return yield* new BadRequestError({
              message: `User ${parsed.assigneeId} is not a member of the organization`,
            })
          }
        }

        const nextAssigneeId = parsed.assigneeId === undefined ? issue.assigneeId : parsed.assigneeId
        const nextPriority = parsed.priority === undefined ? issue.priority : parsed.priority
        const changed = nextAssigneeId !== issue.assigneeId || nextPriority !== issue.priority

        if (!changed) {
          return toResult(issue, false)
        }

        const nextIssue: Issue = {
          ...issue,
          assigneeId: nextAssigneeId,
          priority: nextPriority,
          updatedAt: now,
        }
        yield* issueRepository.save(nextIssue)

        // Assignee changes (set / reassign / clear) emit a domain event from
        // the same transaction; priority-only edits stay silent. `assignedAt`
        // is frozen here as the per-assignment idempotency anchor downstream.
        if (nextAssigneeId !== issue.assigneeId) {
          const outboxEventWriter = yield* OutboxEventWriter
          yield* outboxEventWriter.write({
            eventName: "IssueAssigneeChanged",
            aggregateType: "issue",
            aggregateId: issue.id,
            organizationId: issue.organizationId,
            payload: {
              organizationId: issue.organizationId,
              projectId: issue.projectId,
              issueId: issue.id,
              assigneeId: nextAssigneeId,
              previousAssigneeId: issue.assigneeId,
              actorUserId: parsed.actorUserId,
              assignedAt: now.toISOString(),
            },
          })
        }

        return toResult(nextIssue, true)
      }),
    )
  }).pipe(Effect.withSpan("issues.updateIssueTriage")) as Effect.Effect<
    UpdateIssueTriageResult,
    UpdateIssueTriageError,
    IssueRepository | MembershipRepository | OutboxEventWriter | SqlClient
  >
