import {
  BadRequestError,
  type ConcurrentSqlTransactionError,
  cuidSchema,
  type NotFoundError,
  ProjectId,
  type RepositoryError,
  SqlClient,
  signalIdSchema,
} from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import type { Signal } from "../entities/signal.ts"
import { SignalRepository } from "../ports/signal-repository.ts"

export const signalLifecycleCommandSchema = z.enum(["mute", "unmute"])
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
  readonly updatedAt: Date
  readonly changed: boolean
}

export interface ApplySignalLifecycleCommandResult {
  readonly command: SignalLifecycleCommand
  readonly keepMonitoring: boolean
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
  if (input.command === "mute") {
    if (input.signal.mutedAt !== null) return { nextSignal: input.signal, changed: false }
    return { nextSignal: { ...input.signal, mutedAt: input.now, updatedAt: input.now }, changed: true }
  }
  if (input.signal.mutedAt === null) return { nextSignal: input.signal, changed: false }
  return { nextSignal: { ...input.signal, mutedAt: null, updatedAt: input.now }, changed: true }
}

export const applySignalLifecycleCommandUseCase = (input: ApplySignalLifecycleCommandInput) =>
  Effect.gen(function* () {
    const parsed = applySignalLifecycleCommandInputSchema.parse(input)
    yield* Effect.annotateCurrentSpan("projectId", String(parsed.projectId))
    yield* Effect.annotateCurrentSpan("command", parsed.command)
    const sqlClient = yield* SqlClient
    const signalIds = [...new Set(parsed.signalIds)]
    const now = parsed.now ?? new Date()

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const repository = yield* SignalRepository
        const items: SignalLifecycleCommandItem[] = []

        for (const signalId of signalIds) {
          const signal = yield* repository.findById(signalId)
          if (signal.projectId !== parsed.projectId) {
            return yield* new BadRequestError({ message: "Signal does not belong to the requested project" })
          }
          const { nextSignal, changed } = applyCommandToSignal({ signal, command: parsed.command, now })
          if (changed) yield* repository.save(nextSignal)
          items.push(toLifecycleCommandItem(nextSignal, changed))
        }

        return { command: parsed.command, keepMonitoring: true, items } satisfies ApplySignalLifecycleCommandResult
      }),
    )
  })
