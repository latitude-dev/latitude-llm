import type { NotFoundError, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import { SignalRepository } from "../ports/signal-repository.ts"
import { extractSignalVisualIds } from "../visual-id.ts"

const resolveSignalsMentionedInTextInputSchema = z.object({
  projectId: z.custom<ProjectId>(),
  text: z.string(),
})

export type ResolveSignalsMentionedInTextInput = z.input<typeof resolveSignalsMentionedInTextInputSchema>

export interface ResolvedSignalMention {
  readonly visualId: string
  readonly signalId: string
  readonly slug: string
  readonly name: string
}

export type ResolveSignalsMentionedInTextError = NotFoundError | RepositoryError

export const resolveSignalsMentionedInTextUseCase = (
  input: ResolveSignalsMentionedInTextInput,
): Effect.Effect<readonly ResolvedSignalMention[], ResolveSignalsMentionedInTextError, SignalRepository | SqlClient> =>
  Effect.gen(function* () {
    const parsed = resolveSignalsMentionedInTextInputSchema.parse(input)
    const visualIds = extractSignalVisualIds(parsed.text)
    if (visualIds.length === 0) {
      return []
    }

    const signalRepository = yield* SignalRepository
    const resolved: ResolvedSignalMention[] = []

    for (const visualId of visualIds) {
      const signal = yield* signalRepository
        .findByVisualId(visualId)
        .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
      if (signal === null || signal.projectId !== parsed.projectId) {
        continue
      }

      resolved.push({
        visualId: signal.visualId,
        signalId: signal.id,
        slug: signal.slug,
        name: signal.name,
      })
    }

    return resolved
  })
