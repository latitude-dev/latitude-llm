import { EvaluationRepository } from "@domain/evaluations"
import { OutboxEventWriter } from "@domain/events"
import {
  BadRequestError,
  type ConcurrentSqlTransactionError,
  cuidSchema,
  type NotFoundError,
  ProjectId,
  RepositoryError,
  resolveSettings,
  type SettingsReader,
  SqlClient,
  signalIdSchema,
} from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import type { Signal } from "../entities/signal.ts"
import { SignalRepository } from "../ports/signal-repository.ts"

export const signalLifecycleCommandSchema = z.enum(["resolve", "unresolve", "ignore", "unignore", "mute", "unmute"])
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
  readonly regressedAt: Date | null
  readonly mutedAt: Date | null
  readonly updatedAt: Date
  readonly changed: boolean
}

export interface ApplySignalLifecycleCommandResult {
  readonly command: SignalLifecycleCommand
  /** Effective keep-monitoring choice for `resolve` (input ?? project/org setting); null for every other command. */
  readonly keepMonitoring: boolean | null
  readonly items: readonly SignalLifecycleCommandItem[]
}

export type ApplySignalLifecycleCommandError =
  | BadRequestError
  | ConcurrentSqlTransactionError
  | NotFoundError
  | RepositoryError

const toLifecycleCommandItem = (signal: Signal, changed: boolean): SignalLifecycleCommandItem => ({
  signalId: signal.id,
  resolvedAt: signal.resolvedAt,
  ignoredAt: signal.ignoredAt,
  regressedAt: signal.regressedAt,
  mutedAt: signal.mutedAt,
  updatedAt: signal.updatedAt,
  changed,
})

const applyCommandToSignal = (input: {
  readonly signal: Signal
  readonly command: SignalLifecycleCommand
  readonly now: Date
}): {
  readonly nextSignal: Signal
  readonly changed: boolean
} => {
  const { signal, command, now } = input
  const unchanged = { nextSignal: signal, changed: false }

  switch (command) {
    case "resolve":
      if (signal.resolvedAt !== null) return unchanged
      return {
        nextSignal: {
          ...signal,
          resolvedAt: now,
          ignoredAt: null,
          regressedAt: null,
          // Unmuted so the resolve promise (alert on regression) holds.
          mutedAt: null,
          updatedAt: now,
        },
        changed: true,
      }
    case "unresolve":
      if (signal.resolvedAt === null) return unchanged
      return { nextSignal: { ...signal, resolvedAt: null, mutedAt: null, updatedAt: now }, changed: true }
    case "ignore":
      if (signal.ignoredAt !== null) return unchanged
      return {
        nextSignal: {
          ...signal,
          ignoredAt: now,
          resolvedAt: null,
          regressedAt: null,
          // Ignoring auto-mutes; an existing mute keeps its original timestamp.
          mutedAt: signal.mutedAt ?? now,
          updatedAt: now,
        },
        changed: true,
      }
    case "unignore":
      // Ignore set the mute, so leaving the ignored state releases it.
      if (signal.ignoredAt === null) return unchanged
      return { nextSignal: { ...signal, ignoredAt: null, mutedAt: null, updatedAt: now }, changed: true }
    case "mute":
      if (signal.mutedAt !== null) return unchanged
      return { nextSignal: { ...signal, mutedAt: now, updatedAt: now }, changed: true }
    case "unmute":
      if (signal.mutedAt === null) return unchanged
      return { nextSignal: { ...signal, mutedAt: null, updatedAt: now }, changed: true }
  }
}

const shouldSoftDeleteLinkedEvaluations = (input: {
  readonly command: SignalLifecycleCommand
  readonly keepMonitoring: boolean | null
}): boolean => {
  if (input.command === "ignore") return true
  return input.command === "resolve" && input.keepMonitoring === false
}

export const applySignalLifecycleCommandUseCase = (
  input: ApplySignalLifecycleCommandInput,
): Effect.Effect<
  ApplySignalLifecycleCommandResult,
  ApplySignalLifecycleCommandError,
  EvaluationRepository | OutboxEventWriter | SettingsReader | SignalRepository | SqlClient
> =>
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
          const signal = yield* signalRepository.findByIdForUpdate(signalId)
          if (signal.projectId !== parsed.projectId) {
            return yield* new BadRequestError({
              message: `Signal ${signal.id} does not belong to project ${parsed.projectId}`,
            })
          }

          const { nextSignal, changed } = applyCommandToSignal({ signal, command: parsed.command, now })

          if (changed) {
            yield* signalRepository.save(nextSignal)

            if (shouldSoftDeleteLinkedEvaluations({ command: parsed.command, keepMonitoring })) {
              // Stopping monitoring removes linked evaluations from the signal
              // entirely; un-commands never resurrect them (re-track instead).
              yield* evaluationRepository.softDeleteBySignalId({
                projectId: parsed.projectId,
                signalId,
              })
            }

            // Resolving or ignoring makes any open signal escalation stale.
            // `SignalEscalationEnded` lets the alert-incidents worker close the
            // open row (idempotent no-op when none is open); the manual
            // `resolved`/`ignored` reason flows through to `IncidentClosed`,
            // which suppresses the recovery notification for deliberate closes.
            if (parsed.command === "resolve" || parsed.command === "ignore") {
              yield* outboxEventWriter
                .write({
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
                .pipe(Effect.mapError((cause) => new RepositoryError({ operation: "OutboxEventWriter.write", cause })))
            }
          }

          items.push(toLifecycleCommandItem(nextSignal, changed))
        }

        return { command: parsed.command, keepMonitoring, items } satisfies ApplySignalLifecycleCommandResult
      }),
    )
  }).pipe(Effect.withSpan("issues.applySignalLifecycleCommand"))
