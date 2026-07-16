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
  readonly mutedAt: Date | null
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

const toLifecycleCommandItem = (signal: Signal, changed: boolean): SignalLifecycleCommandItem => ({
  signalId: signal.id,
  mutedAt: signal.mutedAt,
  resolvedAt: signal.resolvedAt,
  ignoredAt: signal.ignoredAt,
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
  switch (input.command) {
    case "resolve":
      if (input.signal.resolvedAt !== null) {
        return { nextSignal: input.signal, changed: false }
      }
      return {
        nextSignal: { ...input.signal, resolvedAt: input.now, updatedAt: input.now },
        changed: true,
      }
    case "unresolve":
      if (input.signal.resolvedAt === null) {
        return { nextSignal: input.signal, changed: false }
      }
      return {
        nextSignal: { ...input.signal, resolvedAt: null, updatedAt: input.now },
        changed: true,
      }
    case "ignore":
      if (input.signal.ignoredAt !== null) {
        return { nextSignal: input.signal, changed: false }
      }
      return {
        nextSignal: { ...input.signal, ignoredAt: input.now, updatedAt: input.now },
        changed: true,
      }
    case "unignore":
      if (input.signal.ignoredAt === null) {
        return { nextSignal: input.signal, changed: false }
      }
      return {
        nextSignal: { ...input.signal, ignoredAt: null, updatedAt: input.now },
        changed: true,
      }
    case "mute":
      if (input.signal.mutedAt !== null) {
        return { nextSignal: input.signal, changed: false }
      }
      return {
        nextSignal: { ...input.signal, mutedAt: input.now, updatedAt: input.now },
        changed: true,
      }
    case "unmute":
      if (input.signal.mutedAt === null) {
        return { nextSignal: input.signal, changed: false }
      }
      return {
        nextSignal: { ...input.signal, mutedAt: null, updatedAt: input.now },
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
          const signal = yield* signalRepository.findByIdForUpdate(signalId)

          if (signal.projectId !== parsed.projectId) {
            return yield* new BadRequestError({
              message: `Signal ${signal.id} does not belong to project ${parsed.projectId}`,
            })
          }

          const { nextSignal, changed } = applyCommandToSignal({
            signal,
            command: parsed.command,
            now,
          })

          if (changed) {
            yield* signalRepository.save(nextSignal)

            if (shouldSoftDeleteLinkedEvaluations({ command: parsed.command, keepMonitoring })) {
              yield* evaluationRepository.softDeleteBySignalId({
                projectId: parsed.projectId,
                signalId,
              })
            }

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
