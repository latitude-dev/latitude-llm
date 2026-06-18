import { EvaluationRepository } from "@domain/evaluations"
import { OutboxEventWriter } from "@domain/events"
import {
  BadRequestError,
  type ConcurrentSqlTransactionError,
  cuidSchema,
  type NotFoundError,
  ProjectId,
  type RepositoryError,
  resolveSettings,
  type SettingsReader,
  SqlClient,
  signalIdSchema,
} from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import type { Signal } from "../entities/signal.ts"
import { SignalRepository } from "../ports/signal-repository.ts"

export const signalLifecycleCommandSchema = z.enum(["resolve", "unresolve", "ignore", "unignore"])

export type SignalLifecycleCommand = z.infer<typeof signalLifecycleCommandSchema>

const applySignalLifecycleCommandInputSchema = z.object({
  projectId: cuidSchema.transform(ProjectId),
  signalIds: z.array(signalIdSchema).min(1),
  command: signalLifecycleCommandSchema,
  keepMonitoring: z.boolean().optional(),
  now: z.date().optional(),
})

export type ApplySignalLifecycleCommandInput = z.input<typeof applySignalLifecycleCommandInputSchema>

export interface SignalLifecycleCommandItem {
  readonly signalId: string
  readonly resolvedAt: Date | null
  readonly ignoredAt: Date | null
  readonly updatedAt: Date
  readonly changed: boolean
}

export interface ApplySignalLifecycleCommandResult {
  readonly command: SignalLifecycleCommand
  readonly keepMonitoring: boolean | null
  readonly items: readonly SignalLifecycleCommandItem[]
}

export type ApplySignalLifecycleCommandError =
  | BadRequestError
  | ConcurrentSqlTransactionError
  | NotFoundError
  | RepositoryError

const toLifecycleCommandItem = (issue: Signal, changed: boolean): SignalLifecycleCommandItem => ({
  signalId: issue.id,
  resolvedAt: issue.resolvedAt,
  ignoredAt: issue.ignoredAt,
  updatedAt: issue.updatedAt,
  changed,
})

const applyCommandToSignal = (input: {
  readonly issue: Signal
  readonly command: SignalLifecycleCommand
  readonly now: Date
}): {
  readonly nextSignal: Signal
  readonly changed: boolean
} => {
  switch (input.command) {
    case "resolve":
      if (input.issue.resolvedAt !== null) {
        return {
          nextSignal: input.issue,
          changed: false,
        }
      }

      return {
        nextSignal: {
          ...input.issue,
          resolvedAt: input.now,
          updatedAt: input.now,
        },
        changed: true,
      }
    case "unresolve":
      if (input.issue.resolvedAt === null) {
        return {
          nextSignal: input.issue,
          changed: false,
        }
      }

      return {
        nextSignal: {
          ...input.issue,
          resolvedAt: null,
          updatedAt: input.now,
        },
        changed: true,
      }
    case "ignore":
      if (input.issue.ignoredAt !== null) {
        return {
          nextSignal: input.issue,
          changed: false,
        }
      }

      return {
        nextSignal: {
          ...input.issue,
          ignoredAt: input.now,
          updatedAt: input.now,
        },
        changed: true,
      }
    case "unignore":
      if (input.issue.ignoredAt === null) {
        return {
          nextSignal: input.issue,
          changed: false,
        }
      }

      return {
        nextSignal: {
          ...input.issue,
          ignoredAt: null,
          updatedAt: input.now,
        },
        changed: true,
      }
  }
}

const shouldSoftDeleteLinkedEvaluations = (input: {
  readonly command: SignalLifecycleCommand
  readonly keepMonitoring: boolean | null
}): boolean => {
  if (input.command === "ignore") {
    return true
  }

  return input.command === "resolve" && input.keepMonitoring === false
}

export const applySignalLifecycleCommandUseCase = (input: ApplySignalLifecycleCommandInput) =>
  Effect.gen(function* () {
    const parsed = applySignalLifecycleCommandInputSchema.parse(input)
    yield* Effect.annotateCurrentSpan("projectId", String(parsed.projectId))
    yield* Effect.annotateCurrentSpan("command", parsed.command)
    const sqlClient = yield* SqlClient
    const keepMonitoring =
      parsed.command === "resolve"
        ? (parsed.keepMonitoring ?? (yield* resolveSettings({ projectId: parsed.projectId })).keepMonitoring)
        : null
    const signalIds = [...new Set(parsed.signalIds)]
    const now = parsed.now ?? new Date()

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const signalRepository = yield* SignalRepository
        const evaluationRepository = yield* EvaluationRepository
        const outboxEventWriter = yield* OutboxEventWriter
        const items: SignalLifecycleCommandItem[] = []

        for (const signalId of signalIds) {
          const issue = yield* signalRepository.findByIdForUpdate(signalId)

          if (issue.projectId !== parsed.projectId) {
            return yield* new BadRequestError({
              message: `Signal ${issue.id} does not belong to project ${parsed.projectId}`,
            })
          }

          const { nextSignal, changed } = applyCommandToSignal({
            issue,
            command: parsed.command,
            now,
          })

          if (changed) {
            yield* signalRepository.save(nextSignal)

            if (shouldSoftDeleteLinkedEvaluations({ command: parsed.command, keepMonitoring })) {
              // Temporary until the evaluations dashboard exists: stopping issue-level monitoring
              // should remove linked evaluations from the signal UI entirely, so we soft delete
              // them instead of moving them into the archived/read-only state.
              yield* evaluationRepository.softDeleteBySignalId({
                projectId: parsed.projectId,
                signalId,
              })
            }

            // Resolving or ignoring an issue makes any open `issue.escalating`
            // incident stale — ignored/resolved issues no longer drive lifecycle
            // or alerting transitions. Emit `SignalEscalationEnded` so the
            // alert-incidents worker closes the open row (idempotent no-op when
            // none is open). The `resolved`/`ignored` reason flows through to
            // `IncidentClosed`, where the notification fan-out is suppressed —
            // a manual close shouldn't fire a recovery notification.
            if (parsed.command === "resolve" || parsed.command === "ignore") {
              yield* outboxEventWriter.write({
                eventName: "SignalEscalationEnded",
                aggregateType: "issue",
                aggregateId: nextSignal.id,
                organizationId: nextSignal.organizationId,
                payload: {
                  organizationId: nextSignal.organizationId,
                  projectId: nextSignal.projectId,
                  signalId: nextSignal.id,
                  endedAt: now.toISOString(),
                  reason: parsed.command === "resolve" ? "resolved" : "ignored",
                },
              })
            }
          }

          items.push(toLifecycleCommandItem(nextSignal, changed))
        }

        return {
          command: parsed.command,
          keepMonitoring,
          items,
        } satisfies ApplySignalLifecycleCommandResult
      }),
    )
  }).pipe(Effect.withSpan("issues.applySignalLifecycleCommand")) as Effect.Effect<
    ApplySignalLifecycleCommandResult,
    ApplySignalLifecycleCommandError,
    EvaluationRepository | SignalRepository | OutboxEventWriter | SettingsReader | SqlClient
  >
