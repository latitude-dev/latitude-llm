import { OutboxEventWriter } from "@domain/events"
import { MembershipRepository } from "@domain/organizations"
import {
  BadRequestError,
  type ConcurrentSqlTransactionError,
  cuidSchema,
  isSeverityIncrease,
  type NotFoundError,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  SqlClient,
  signalIdSchema,
} from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import { type Signal, type SignalPriority, signalPrioritySchema } from "../entities/signal.ts"
import { SignalRepository } from "../ports/signal-repository.ts"

const updateSignalTriageInputSchema = z.object({
  projectId: cuidSchema.transform(ProjectId),
  signalId: signalIdSchema,
  /** User performing the edit — carried on the triage events so consumers can skip the actor's own edit. */
  actorUserId: cuidSchema,
  // `undefined` (key omitted) leaves the field unchanged; explicit `null` clears it; a value sets it.
  assigneeId: cuidSchema.nullable().optional(),
  priority: signalPrioritySchema.nullable().optional(),
  now: z.date().optional(),
})

export type UpdateSignalTriageInput = z.input<typeof updateSignalTriageInputSchema>

export interface UpdateSignalTriageResult {
  readonly signalId: string
  readonly assigneeId: string | null
  readonly priority: SignalPriority | null
  readonly updatedAt: Date
  readonly changed: boolean
}

export type UpdateSignalTriageError = BadRequestError | ConcurrentSqlTransactionError | NotFoundError | RepositoryError

const toResult = (issue: Signal, changed: boolean): UpdateSignalTriageResult => ({
  signalId: issue.id,
  assigneeId: issue.assigneeId,
  priority: issue.priority,
  updatedAt: issue.updatedAt,
  changed,
})

export const updateSignalTriageUseCase = (input: UpdateSignalTriageInput) =>
  Effect.gen(function* () {
    const parsed = updateSignalTriageInputSchema.parse(input)
    yield* Effect.annotateCurrentSpan("projectId", String(parsed.projectId))
    yield* Effect.annotateCurrentSpan("signalId", parsed.signalId)
    const sqlClient = yield* SqlClient
    const now = parsed.now ?? new Date()

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const signalRepository = yield* SignalRepository
        const membershipRepository = yield* MembershipRepository
        const issue = yield* signalRepository.findByIdForUpdate(parsed.signalId)

        if (issue.projectId !== parsed.projectId) {
          return yield* new BadRequestError({
            message: `Signal ${issue.id} does not belong to project ${parsed.projectId}`,
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

        const nextSignal: Signal = {
          ...issue,
          assigneeId: nextAssigneeId,
          priority: nextPriority,
          updatedAt: now,
        }
        yield* signalRepository.save(nextSignal)

        // Assignee changes (set / reassign / clear) and priority *increases*
        // each emit a domain event from the same transaction. `assignedAt` /
        // `reprioritizedAt` are frozen here as the per-edit idempotency
        // anchors downstream.
        const outboxEventWriter = yield* OutboxEventWriter

        if (nextAssigneeId !== issue.assigneeId) {
          yield* outboxEventWriter.write({
            eventName: "SignalAssigneeChanged",
            aggregateType: "issue",
            aggregateId: issue.id,
            organizationId: issue.organizationId,
            payload: {
              organizationId: issue.organizationId,
              projectId: issue.projectId,
              signalId: issue.id,
              assigneeId: nextAssigneeId,
              previousAssigneeId: issue.assigneeId,
              actorUserId: parsed.actorUserId,
              assignedAt: now.toISOString(),
            },
          })
        }

        // Only an increase is worth announcing, and an unset priority ranks
        // below `low` — so a first priority fires, a downgrade or a clear
        // stays out of the outbox entirely rather than being filtered later.
        if (isSeverityIncrease(issue.priority, nextPriority)) {
          yield* outboxEventWriter.write({
            eventName: "SignalReprioritized",
            aggregateType: "issue",
            aggregateId: issue.id,
            organizationId: issue.organizationId,
            payload: {
              organizationId: issue.organizationId,
              projectId: issue.projectId,
              signalId: issue.id,
              priority: nextPriority,
              previousPriority: issue.priority,
              actorUserId: parsed.actorUserId,
              reprioritizedAt: now.toISOString(),
            },
          })
        }

        return toResult(nextSignal, true)
      }),
    )
  }).pipe(Effect.withSpan("issues.updateSignalTriage")) as Effect.Effect<
    UpdateSignalTriageResult,
    UpdateSignalTriageError,
    SignalRepository | MembershipRepository | OutboxEventWriter | SqlClient
  >
