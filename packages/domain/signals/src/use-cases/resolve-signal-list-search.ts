import type { OrganizationId, ProjectId, SignalId } from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import { SignalRepository } from "../ports/signal-repository.ts"
import { embedSignalSearchQueryUseCase } from "./embed-signal-search-query.ts"
import type { signalSearchSchema } from "./list-signals.ts"

const resolveSignalListSearchInputSchema = z.object({
  organizationId: z.custom<OrganizationId>(),
  projectId: z.custom<ProjectId>(),
  searchQuery: z.string().min(1).optional(),
})

export type ResolveSignalListSearchInput = z.input<typeof resolveSignalListSearchInputSchema>

export interface ResolvedSignalListSearch {
  readonly signalIds?: readonly SignalId[]
  readonly search?: z.infer<typeof signalSearchSchema>
  readonly textSearchQuery?: string
}

export const resolvedListSearchFilters = (resolved: ResolvedSignalListSearch) => ({
  ...(resolved.signalIds ? { signalIds: [...resolved.signalIds] } : {}),
  ...(resolved.search ? { search: resolved.search } : {}),
  ...(resolved.textSearchQuery ? { textSearchQuery: resolved.textSearchQuery } : {}),
})

export const resolveSignalListSearchUseCase = (input: ResolveSignalListSearchInput) =>
  Effect.gen(function* () {
    const parsed = resolveSignalListSearchInputSchema.parse(input)
    const trimmedSearchQuery = parsed.searchQuery?.trim()
    if (!trimmedSearchQuery) {
      return {} as ResolvedSignalListSearch
    }

    const signalRepository = yield* SignalRepository
    const [byId, bySlug] = yield* Effect.all(
      [
        signalRepository
          .findById(trimmedSearchQuery as SignalId)
          .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null))),
        signalRepository
          .findBySlug({ projectId: parsed.projectId, slug: trimmedSearchQuery })
          .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null))),
      ],
      { concurrency: 2 },
    )
    const idMatch = byId && byId.projectId === parsed.projectId ? byId : null
    const directMatch = idMatch ?? bySlug
    if (directMatch) {
      return { signalIds: [directMatch.id] } as ResolvedSignalListSearch
    }

    const embedded = yield* embedSignalSearchQueryUseCase({
      organizationId: String(parsed.organizationId),
      projectId: String(parsed.projectId),
      query: trimmedSearchQuery,
    }).pipe(
      Effect.map(
        (result): ResolvedSignalListSearch => ({
          search: {
            query: result.query,
            normalizedEmbedding: result.normalizedEmbedding,
          },
        }),
      ),
      Effect.catch(() => Effect.succeed({ textSearchQuery: trimmedSearchQuery } as ResolvedSignalListSearch)),
    )

    return embedded
  }).pipe(Effect.withSpan("signals.resolveListSearch"))
