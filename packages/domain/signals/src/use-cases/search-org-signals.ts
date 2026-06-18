import type { OrganizationId, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { deriveSignalLifecycleStates } from "../helpers.ts"
import { SignalRepository } from "../ports/signal-repository.ts"

const DEFAULT_SEARCH_LIMIT = 10

export interface OrgSignalSearchItem {
  readonly id: string
  readonly projectId: string
  readonly projectSlug: string
  readonly projectName: string
  readonly slug: string
  readonly name: string
  readonly states: readonly string[]
}

export interface SearchOrgSignalsInput {
  /** Telemetry only — scoping is enforced by the {@link SqlClient}'s RLS context, not this value. */
  readonly organizationId: OrganizationId
  readonly query: string
  /** When provided, the semantic tier runs in addition to the lexical tier. */
  readonly normalizedEmbedding?: readonly number[]
  /** The palette's current project, when any — its issues rank first within each tier. */
  readonly preferProjectId?: ProjectId
  readonly limit?: number
  readonly now?: Date
}

/**
 * Org-wide issue search for the Command Palette. Runs the repository's lexical tier always and the
 * semantic tier when an embedding is supplied, then merges them **lexical-first**, de-duplicates by
 * issue id, and caps at `limit`. The repository only returns active (unresolved, unignored) issues.
 * Lifecycle states are derived here (Postgres-only — no ClickHouse), so each result is ready to
 * render with its project and current states.
 */
export const searchOrgSignalsUseCase = (
  input: SearchOrgSignalsInput,
): Effect.Effect<readonly OrgSignalSearchItem[], RepositoryError, SignalRepository | SqlClient> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("organizationId", String(input.organizationId))
    const repo = yield* SignalRepository
    const now = input.now ?? new Date()
    const limit = input.limit ?? DEFAULT_SEARCH_LIMIT

    const prefer = input.preferProjectId !== undefined ? { preferProjectId: input.preferProjectId } : {}
    const lexical = yield* repo.searchOrgWide({ query: input.query, limit, ...prefer })
    const semantic = input.normalizedEmbedding
      ? yield* repo.searchOrgWide({
          query: input.query,
          normalizedEmbedding: input.normalizedEmbedding,
          limit,
          ...prefer,
        })
      : []

    // Lexical (exact/keyword) hits rank first, then semantic hits not already shown; dedupe by id.
    const seen = new Set<string>()
    const merged: OrgSignalSearchItem[] = []
    for (const hit of [...lexical, ...semantic]) {
      if (seen.has(hit.issue.id)) continue
      seen.add(hit.issue.id)
      merged.push({
        id: hit.issue.id,
        projectId: hit.issue.projectId,
        projectSlug: hit.projectSlug,
        projectName: hit.projectName,
        slug: hit.issue.slug,
        name: hit.issue.name,
        states: [
          ...deriveSignalLifecycleStates({
            issue: hit.issue,
            isEscalating: hit.issue.lifecycle.isEscalating,
            isRegressed: hit.issue.lifecycle.isRegressed,
            now,
          }),
        ],
      })
      if (merged.length >= limit) break
    }
    return merged
  }).pipe(Effect.withSpan("issues.searchOrgSignals"))
