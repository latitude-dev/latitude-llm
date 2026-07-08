import { EMBEDDING_DIMENSIONS, resolveEmbeddingConfig } from "@domain/ai"
import { EvaluationSignalRepository } from "@domain/evaluations"
import {
  NotFoundError,
  type ProjectId,
  RepositoryError,
  SignalId,
  SqlClient,
  type SqlClientShape,
} from "@domain/shared"
import {
  formatSignalVisualId,
  normalizeSignalCentroid,
  type OrgSignalSearchHit,
  SIGNAL_DISCOVERY_MIN_SIMILARITY,
  SIGNAL_DISCOVERY_MIN_VECTOR_SIMILARITY,
  SIGNAL_DISCOVERY_SEARCH_CANDIDATES,
  SIGNAL_DISCOVERY_SEARCH_RATIO,
  SIGNAL_PRIORITY_ORDER,
  type Signal,
  type SignalLifecycleFlags,
  SignalRepository,
  type SignalWithLifecycle,
  signalSchema,
  UNASSIGNED_FILTER,
} from "@domain/signals"
import { and, asc, count, desc, eq, getTableColumns, ilike, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { incidents } from "../schema/alert-incidents.ts"
import { projects } from "../schema/projects.ts"
import { scores } from "../schema/scores.ts"
import { signals } from "../schema/signals.ts"
import { preferProjectFirst } from "./org-search.ts"

// Lifecycle flags derived from `incidents` are joined onto every
// non-locking issue read. The EXISTS subquery is the system of record for
// "is this signal currently escalating" — see `deriveSignalLifecycleStates`.
//
// `signals.id` is qualified via raw SQL because Drizzle's template renders
// the bare column inside the EXISTS subquery as `"id"` (unqualified), which
// collides with `incidents.id` (the inner scope's PK) and silently
// resolves to the wrong column. The fully qualified outer reference avoids
// the shadowing.
const outerSignalId = sql.raw(`"latitude"."signals"."id"`)

const isEscalatingExpr = sql<boolean>`exists (
  select 1
  from ${incidents}
  where ${incidents.sourceType} = 'signal'
    and ${incidents.sourceId} = ${outerSignalId}
    and ${incidents.endedAt} is null
)`

const signalColumnsWithLifecycle = {
  ...getTableColumns(signals),
  isEscalating: isEscalatingExpr,
} as const

type SignalRowWithLifecycle = typeof signals.$inferSelect & {
  readonly isEscalating: boolean
}

const toDomainSignal = (row: typeof signals.$inferSelect): Signal =>
  signalSchema.parse({
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    slug: row.slug,
    visualId: row.visualId,
    name: row.name,
    description: row.description,
    source: row.source,
    origin: row.origin,
    filters: row.filters,
    assigneeId: row.assigneeId,
    priority: row.priority,
    centroid: row.centroid,
    clusteredAt: row.clusteredAt,
    mutedAt: row.mutedAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

const toSignalWithLifecycle = (row: SignalRowWithLifecycle): SignalWithLifecycle => {
  const issue = toDomainSignal(row)
  const lifecycle: SignalLifecycleFlags = {
    isEscalating: row.isEscalating,
  }
  return Object.assign({}, issue, { lifecycle })
}

type OrgSignalSearchRow = SignalRowWithLifecycle & {
  readonly projectSlug: string
  readonly projectName: string
  readonly score: number
}

const toOrgSignalSearchHit = (row: OrgSignalSearchRow): OrgSignalSearchHit => ({
  issue: toSignalWithLifecycle(row),
  projectSlug: row.projectSlug,
  projectName: row.projectName,
  score: Number(row.score),
})

const validateVector = (
  vector: readonly number[],
  operation: string,
): Effect.Effect<readonly number[], RepositoryError> => {
  if (vector.length !== EMBEDDING_DIMENSIONS) {
    return Effect.fail(
      new RepositoryError({
        operation,
        cause: new Error(`Expected ${EMBEDDING_DIMENSIONS} dimensions, received ${vector.length}`),
      }),
    )
  }

  const nonFiniteIndex = vector.findIndex((value) => !Number.isFinite(value))
  if (nonFiniteIndex !== -1) {
    return Effect.fail(
      new RepositoryError({
        operation,
        cause: new Error(`Vector contains non-finite value at index ${nonFiniteIndex}`),
      }),
    )
  }

  return Effect.succeed(vector)
}

const toCentroidEmbedding = (issue: Signal): Effect.Effect<readonly number[] | null, RepositoryError> =>
  Effect.gen(function* () {
    // User-created signals carry no centroid; only discovered signals cluster.
    if (issue.centroid === null || issue.centroid.mass <= 0) {
      return null
    }

    // The embedding model is a one-time deployment choice (different models
    // produce incompatible vector spaces, and Latitude never re-embeds), so a
    // centroid stamped with anything but the configured model is a hard error.
    const embeddingConfig = yield* resolveEmbeddingConfig().pipe(
      Effect.mapError((error) => new RepositoryError({ operation: "SignalRepository.save", cause: error })),
    )
    if (issue.centroid.model !== embeddingConfig.model) {
      return yield* Effect.fail(
        new RepositoryError({
          operation: "SignalRepository.save",
          cause: new Error(`Unsupported centroid model ${issue.centroid.model}`),
        }),
      )
    }

    const vector = normalizeSignalCentroid(issue.centroid)
    if (vector.length === 0) {
      return yield* Effect.fail(
        new RepositoryError({
          operation: "SignalRepository.save",
          cause: new Error("Positive-mass centroid normalized to an empty vector"),
        }),
      )
    }

    return yield* validateVector(vector, "SignalRepository.save")
  })

const toInsertRow = (issue: Signal, centroidEmbedding: readonly number[] | null): typeof signals.$inferInsert => ({
  id: issue.id,
  organizationId: issue.organizationId,
  projectId: issue.projectId,
  slug: issue.slug,
  visualId: issue.visualId,
  name: issue.name,
  description: issue.description,
  source: issue.source,
  origin: issue.origin,
  filters: issue.filters,
  assigneeId: issue.assigneeId,
  priority: issue.priority,
  centroid: issue.centroid,
  centroidEmbedding: centroidEmbedding === null ? null : [...centroidEmbedding],
  clusteredAt: issue.clusteredAt,
  mutedAt: issue.mutedAt,
  deletedAt: issue.deletedAt,
  createdAt: issue.createdAt,
  updatedAt: issue.updatedAt,
})

const signalRepositoryCoreLive = Layer.effect(
  SignalRepository,
  Effect.gen(function* () {
    return {
      list: ({ projectId, limit, offset }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) => {
              // Every non-deleted signal is listed regardless of occurrence count: user-created
              // signals are deliberate (and may have zero occurrences until traffic arrives), and
              // discovered signals are surfaced as soon as they exist.
              return db
                .select(signalColumnsWithLifecycle)
                .from(signals)
                .where(
                  and(
                    eq(signals.organizationId, organizationId),
                    eq(signals.projectId, projectId),
                    isNull(signals.deletedAt),
                  ),
                )
                .orderBy(desc(signals.createdAt))
                .limit(limit + 1)
                .offset(offset)
            })
            .pipe(
              Effect.map((rows) => ({
                items: rows.slice(0, limit).map(toSignalWithLifecycle),
                hasMore: rows.length > limit,
                limit,
                offset,
              })),
            )
        }),

      listTableRows: ({ projectId, limit, offset, lifecycleGroup, assigneeIds, searchQuery, timeRange, sort }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) => {
              const assigneeConditions = assigneeIds?.length
                ? assigneeIds.includes(UNASSIGNED_FILTER)
                  ? or(
                      isNull(signals.assigneeId),
                      ...(() => {
                        const assigned = assigneeIds.filter((id) => id !== UNASSIGNED_FILTER)
                        return assigned.length ? [inArray(signals.assigneeId, assigned)] : []
                      })(),
                    )
                  : inArray(signals.assigneeId, assigneeIds)
                : undefined
              const search = searchQuery?.trim()
              const scoreCreatedFromClause = timeRange?.from ? sql`and ${scores.createdAt} >= ${timeRange.from}` : sql``
              const scoreCreatedToClause = timeRange?.to ? sql`and ${scores.createdAt} <= ${timeRange.to}` : sql``
              const hasScoreActivityInTimeRange =
                timeRange?.from || timeRange?.to
                  ? sql<boolean>`exists (
                      select 1
                      from ${scores}
                      where ${scores.organizationId} = ${organizationId}
                        and ${scores.projectId} = ${projectId}
                        and ${scores.signalId} = ${signals.id}
                        and ${scores.draftedAt} is null
                        ${scoreCreatedFromClause}
                        ${scoreCreatedToClause}
                    )`
                  : undefined
              const where = and(
                eq(signals.organizationId, organizationId),
                eq(signals.projectId, projectId),
                isNull(signals.deletedAt),
                lifecycleGroup === "active"
                  ? isNull(signals.mutedAt)
                  : lifecycleGroup === "archived"
                    ? isNotNull(signals.mutedAt)
                    : undefined,
                assigneeConditions,
                hasScoreActivityInTimeRange,
                search ? or(ilike(signals.name, `%${search}%`), ilike(signals.description, `%${search}%`)) : undefined,
              )
              const direction = sort?.direction === "asc" ? asc : desc
              const lastSeenSort = sql<Date>`coalesce((
                select max(${scores.createdAt})
                from ${scores}
                where ${scores.organizationId} = ${organizationId}
                  and ${scores.projectId} = ${projectId}
                  and ${scores.signalId} = ${signals.id}
                  and ${scores.draftedAt} is null
                  ${scoreCreatedFromClause}
                  ${scoreCreatedToClause}
              ), ${signals.createdAt})`
              const occurrencesSort = sql<number>`(
                select count(*)
                from ${scores}
                where ${scores.organizationId} = ${organizationId}
                  and ${scores.projectId} = ${projectId}
                  and ${scores.signalId} = ${signals.id}
                  and ${scores.draftedAt} is null
                  ${scoreCreatedFromClause}
                  ${scoreCreatedToClause}
              )`
              const affectedSessionsSort = sql<number>`(
                select count(distinct ${scores.sessionId})
                from ${scores}
                where ${scores.organizationId} = ${organizationId}
                  and ${scores.projectId} = ${projectId}
                  and ${scores.signalId} = ${signals.id}
                  and ${scores.draftedAt} is null
                  and ${scores.sessionId} is not null
                  and ${scores.sessionId} != ''
                  ${scoreCreatedFromClause}
                  ${scoreCreatedToClause}
              )`
              // Priority group is the unconditional primary order key so every
              // page arrives grouped Urgent → … → No priority, matching the
              // web list's sections; the selected sort applies within each
              // group. Mirrors `sortCandidates` in the analytics path.
              const priorityRank = sql<number>`case ${signals.priority}
                when 'urgent' then ${SIGNAL_PRIORITY_ORDER.urgent}
                when 'high' then ${SIGNAL_PRIORITY_ORDER.high}
                when 'medium' then ${SIGNAL_PRIORITY_ORDER.medium}
                when 'low' then ${SIGNAL_PRIORITY_ORDER.low}
                else ${SIGNAL_PRIORITY_ORDER.none}
              end`
              const secondaryOrderBy =
                sort?.field === "state"
                  ? [direction(signals.mutedAt), direction(signals.updatedAt)]
                  : sort?.field === "occurrences"
                    ? [direction(occurrencesSort), desc(lastSeenSort), asc(signals.id)]
                    : sort?.field === "affectedSessions"
                      ? [direction(affectedSessionsSort), desc(lastSeenSort), asc(signals.id)]
                      : [direction(lastSeenSort), direction(signals.createdAt), asc(signals.id)]
              const orderBy = [asc(priorityRank), ...secondaryOrderBy]

              return Promise.all([
                db
                  .select(signalColumnsWithLifecycle)
                  .from(signals)
                  .where(where)
                  .orderBy(...orderBy)
                  .limit(limit)
                  .offset(offset),
                db.select({ value: count() }).from(signals).where(where),
              ])
            })
            .pipe(
              Effect.map(([rows, totals]) => {
                const totalCount = Number(totals[0]?.value ?? 0)
                return {
                  items: rows.map(toSignalWithLifecycle),
                  hasMore: offset + limit < totalCount,
                  totalCount,
                  limit,
                  offset,
                }
              }),
            )
        }),

      findById: (id: SignalId) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .select(signalColumnsWithLifecycle)
                .from(signals)
                .where(and(eq(signals.organizationId, organizationId), eq(signals.id, id), isNull(signals.deletedAt)))
                .limit(1),
            )
            .pipe(
              Effect.flatMap((rows) => {
                const row = rows[0]
                if (!row) return Effect.fail(new NotFoundError({ entity: "Signal", id }))
                return Effect.succeed(toSignalWithLifecycle(row))
              }),
            )
        }),

      findByIdForUpdate: (id: SignalId) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .select()
                .from(signals)
                .where(and(eq(signals.organizationId, organizationId), eq(signals.id, id), isNull(signals.deletedAt)))
                .limit(1)
                .for("update"),
            )
            .pipe(
              Effect.flatMap((rows) => {
                const row = rows[0]
                if (!row) return Effect.fail(new NotFoundError({ entity: "Signal", id }))
                return Effect.succeed(toDomainSignal(row))
              }),
            )
        }),

      findByIds: ({
        projectId,
        signalIds,
      }: {
        readonly projectId: ProjectId
        readonly signalIds: readonly SignalId[]
      }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) => {
              if (signalIds.length === 0) {
                return db.select(signalColumnsWithLifecycle).from(signals).where(sql`1 = 0`) // Return empty result
              }

              return db
                .select(signalColumnsWithLifecycle)
                .from(signals)
                .where(
                  and(
                    eq(signals.organizationId, organizationId),
                    eq(signals.projectId, projectId),
                    isNull(signals.deletedAt),
                    inArray(signals.id, signalIds),
                  ),
                )
            })
            .pipe(Effect.map((rows) => rows.map(toSignalWithLifecycle)))
        }),

      hybridSearch: ({ projectId, query, normalizedEmbedding }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const vector = yield* validateVector(normalizedEmbedding, "SignalRepository.hybridSearch")
          // pgvector's wire format expects a `vector` literal; node-postgres binds a JS
          // number[] as a Postgres array parameter, which cannot be cast to `vector`.
          // Inline the vector literal instead. This is safe because `validateVector` enforces
          // the exact dimension count and that every value is a finite number.
          const queryVector = sql.raw(`'[${vector.join(",")}]'::vector`)

          const lexicalQuery = sql`websearch_to_tsquery('english', ${query})`
          const vectorScore = sql<number>`(1::double precision - (${signals.centroidEmbedding} <=> ${queryVector}))`
          const lexicalScore = sql<number>`least(
            1::double precision,
            greatest(0::double precision, ts_rank_cd(${signals.searchDocument}, ${lexicalQuery})::double precision)
          )`
          const score = sql<number>`(${SIGNAL_DISCOVERY_SEARCH_RATIO}::double precision * ${vectorScore} + ${
            1 - SIGNAL_DISCOVERY_SEARCH_RATIO
          }::double precision * ${lexicalScore})`

          const rows = yield* sqlClient.query((db, organizationId) =>
            db
              .select({
                signalId: signals.id,
                name: signals.name,
                description: signals.description,
                score,
              })
              .from(signals)
              .where(
                and(
                  eq(signals.organizationId, organizationId),
                  eq(signals.projectId, projectId),
                  isNull(signals.deletedAt),
                  isNotNull(signals.centroidEmbedding),
                  sql`(${score} >= ${SIGNAL_DISCOVERY_MIN_SIMILARITY} OR ${vectorScore} >= ${SIGNAL_DISCOVERY_MIN_VECTOR_SIMILARITY})`,
                ),
              )
              .orderBy(desc(score), desc(vectorScore), desc(signals.updatedAt), asc(signals.id))
              .limit(SIGNAL_DISCOVERY_SEARCH_CANDIDATES),
          )

          return rows.map((row) => ({
            ...row,
            signalId: SignalId(row.signalId),
          }))
        }),

      findSimilarByCentroid: ({ projectId, signalId, limit }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

          // Two round-trips instead of a self-join: the source embedding is read
          // first so the second query can inline it as a pgvector literal (the
          // same wire-format constraint `hybridSearch` documents — a JS number[]
          // binds as a Postgres array, which cannot be cast to `vector`).
          const [source] = yield* sqlClient.query((db, organizationId) =>
            db
              .select({ centroidEmbedding: signals.centroidEmbedding })
              .from(signals)
              .where(
                and(
                  eq(signals.organizationId, organizationId),
                  eq(signals.projectId, projectId),
                  eq(signals.id, signalId),
                  isNull(signals.deletedAt),
                ),
              )
              .limit(1),
          )

          // Missing issue or zero-mass centroid (no embedding persisted): the
          // semantic signal degrades to nothing rather than failing the read.
          const embedding = source?.centroidEmbedding ?? null
          if (embedding === null) return []
          const vector = yield* validateVector(embedding, "SignalRepository.findSimilarByCentroid")
          const queryVector = sql.raw(`'[${vector.join(",")}]'::vector`)

          // Exact cosine scan over the project's other signals — no ANN index by
          // design (see the schema comment on `centroidEmbedding`). Resolved and
          // ignored signals are deliberately included. `save()` only persists
          // embeddings for the configured embedding model, so every non-null
          // row is in the same embedding space by construction.
          const similarity = sql<number>`(1::double precision - (${signals.centroidEmbedding} <=> ${queryVector}))`
          const rows = yield* sqlClient.query((db, organizationId) =>
            db
              .select({ signalId: signals.id, similarity })
              .from(signals)
              .where(
                and(
                  eq(signals.organizationId, organizationId),
                  eq(signals.projectId, projectId),
                  ne(signals.id, signalId),
                  isNull(signals.deletedAt),
                  isNotNull(signals.centroidEmbedding),
                ),
              )
              .orderBy(desc(similarity), desc(signals.updatedAt), asc(signals.id))
              .limit(limit),
          )

          return rows.map((row) => ({
            signalId: SignalId(row.signalId),
            similarity: Number(row.similarity),
          }))
        }),

      searchOrgWide: ({ query, normalizedEmbedding, preferProjectId, limit }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const lexicalQuery = sql`websearch_to_tsquery('english', ${query})`
          // Current project first *within* the tier, so a local lexical hit still beats a remote
          // semantic one (the tiers are merged lexical-first by the caller).
          const projectFirst = preferProjectFirst(signals.projectId, preferProjectId)

          // Lexical tier: GIN-backed full-text match OR a literal name substring. No embedding
          // round-trip, so this is the instant, index-backed path.
          if (normalizedEmbedding === undefined) {
            const lexicalScore = sql<number>`ts_rank_cd(${signals.searchDocument}, ${lexicalQuery})::double precision`
            const rows = yield* sqlClient.query((db, organizationId) =>
              db
                .select({
                  ...signalColumnsWithLifecycle,
                  projectSlug: projects.slug,
                  projectName: projects.name,
                  score: lexicalScore,
                })
                .from(signals)
                .innerJoin(projects, eq(projects.id, signals.projectId))
                .where(
                  and(
                    eq(signals.organizationId, organizationId),
                    isNull(projects.deletedAt),
                    isNull(signals.mutedAt),
                    or(sql`${signals.searchDocument} @@ ${lexicalQuery}`, ilike(signals.name, `%${query}%`)),
                  ),
                )
                .orderBy(...projectFirst, desc(lexicalScore), desc(signals.updatedAt), asc(signals.id))
                .limit(limit),
            )
            return rows.map(toOrgSignalSearchHit)
          }

          // Semantic tier: the same vector + lexical blend `hybridSearch` uses, but org-wide.
          // NB: `centroid_embedding` has no ANN index (see schema) — this is an exact cosine scan
          // over every org issue. Acceptable for the debounced, capped palette tier; revisit with
          // an HNSW index if a large org regresses.
          const vector = yield* validateVector(normalizedEmbedding, "SignalRepository.searchOrgWide")
          const queryVector = sql.raw(`'[${vector.join(",")}]'::vector`)
          const vectorScore = sql<number>`(1::double precision - (${signals.centroidEmbedding} <=> ${queryVector}))`
          const lexicalScore = sql<number>`least(
            1::double precision,
            greatest(0::double precision, ts_rank_cd(${signals.searchDocument}, ${lexicalQuery})::double precision)
          )`
          const score = sql<number>`(${SIGNAL_DISCOVERY_SEARCH_RATIO}::double precision * ${vectorScore} + ${
            1 - SIGNAL_DISCOVERY_SEARCH_RATIO
          }::double precision * ${lexicalScore})`

          const rows = yield* sqlClient.query((db, organizationId) =>
            db
              .select({
                ...signalColumnsWithLifecycle,
                projectSlug: projects.slug,
                projectName: projects.name,
                score,
              })
              .from(signals)
              .innerJoin(projects, eq(projects.id, signals.projectId))
              .where(
                and(
                  eq(signals.organizationId, organizationId),
                  isNull(projects.deletedAt),
                  isNull(signals.mutedAt),
                  isNull(signals.deletedAt),
                  isNotNull(signals.centroidEmbedding),
                  sql`(${score} >= ${SIGNAL_DISCOVERY_MIN_SIMILARITY} OR ${vectorScore} >= ${SIGNAL_DISCOVERY_MIN_VECTOR_SIMILARITY})`,
                ),
              )
              .orderBy(...projectFirst, desc(score), desc(vectorScore), desc(signals.updatedAt), asc(signals.id))
              .limit(limit),
          )
          return rows.map(toOrgSignalSearchHit)
        }),

      save: (issue: Signal) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const centroidEmbedding = yield* toCentroidEmbedding(issue)
          const row = toInsertRow(issue, centroidEmbedding)

          yield* sqlClient.query((db) =>
            db
              .insert(signals)
              .values(row)
              .onConflictDoUpdate({
                target: signals.id,
                set: {
                  projectId: row.projectId,
                  slug: row.slug,
                  name: row.name,
                  description: row.description,
                  source: row.source,
                  origin: row.origin,
                  filters: row.filters,
                  assigneeId: row.assigneeId,
                  priority: row.priority,
                  centroid: row.centroid,
                  centroidEmbedding: row.centroidEmbedding,
                  clusteredAt: row.clusteredAt,
                  mutedAt: row.mutedAt,
                  deletedAt: row.deletedAt,
                  updatedAt: row.updatedAt,
                },
              }),
          )
        }),

      softDelete: (id: SignalId) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db, organizationId) =>
            db
              .update(signals)
              .set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
              .where(and(eq(signals.organizationId, organizationId), eq(signals.id, id), isNull(signals.deletedAt))),
          )
        }),

      countBySlug: (input) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const conditions = and(
            eq(signals.organizationId, sqlClient.organizationId),
            eq(signals.projectId, input.projectId),
            eq(signals.slug, input.slug),
            isNull(signals.deletedAt),
            ...(input.excludeSignalId ? [ne(signals.id, input.excludeSignalId)] : []),
          )
          const [row] = yield* sqlClient.query((db) =>
            db.select({ count: sql<number>`count(*)::int` }).from(signals).where(conditions),
          )
          return row?.count ?? 0
        }),

      allocateVisualId: () =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const result = yield* sqlClient.query((db) =>
            db.execute(sql`SELECT nextval('"latitude"."signal_visual_id_seq"')::bigint AS seq`),
          )
          const sequence = Number((result as { rows?: ReadonlyArray<{ seq?: string | number }> }).rows?.[0]?.seq)
          if (!Number.isInteger(sequence) || sequence < 1) {
            return yield* Effect.fail(
              new RepositoryError({
                operation: "SignalRepository.allocateVisualId",
                cause: new Error(`Invalid visual id sequence: ${sequence}`),
              }),
            )
          }
          return formatSignalVisualId(sequence)
        }),

      findByVisualId: (visualId) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const normalizedVisualId = visualId.trim().toUpperCase()
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .select(signalColumnsWithLifecycle)
                .from(signals)
                .where(
                  and(
                    eq(signals.organizationId, organizationId),
                    eq(signals.visualId, normalizedVisualId),
                    isNull(signals.deletedAt),
                  ),
                )
                .limit(1),
            )
            .pipe(
              Effect.flatMap((rows) => {
                const row = rows[0]
                if (!row) return Effect.fail(new NotFoundError({ entity: "Signal", id: normalizedVisualId }))
                return Effect.succeed(toSignalWithLifecycle(row))
              }),
            )
        }),

      findBySlug: ({ projectId, slug }: { readonly projectId: ProjectId; readonly slug: string }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .select(signalColumnsWithLifecycle)
                .from(signals)
                .where(
                  and(
                    eq(signals.organizationId, organizationId),
                    eq(signals.projectId, projectId),
                    eq(signals.slug, slug),
                    isNull(signals.deletedAt),
                  ),
                )
                .limit(1),
            )
            .pipe(
              Effect.flatMap((rows) => {
                const row = rows[0]
                if (!row) return Effect.fail(new NotFoundError({ entity: "Signal", id: slug }))
                return Effect.succeed(toSignalWithLifecycle(row))
              }),
            )
        }),

      existsBySlug: ({ projectId, slug }: { readonly projectId: ProjectId; readonly slug: string }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const [row] = yield* sqlClient.query((db, organizationId) =>
            db
              .select({ id: signals.id })
              .from(signals)
              .where(
                and(
                  eq(signals.organizationId, organizationId),
                  eq(signals.projectId, projectId),
                  eq(signals.slug, slug),
                  isNull(signals.deletedAt),
                ),
              )
              .limit(1),
          )
          return row !== undefined
        }),
    }
  }),
)

const evaluationSignalRepositoryFromSignalRepositoryLive = Layer.effect(
  EvaluationSignalRepository,
  Effect.gen(function* () {
    return yield* SignalRepository
  }),
)

export const SignalRepositoryLive = Layer.mergeAll(
  signalRepositoryCoreLive,
  evaluationSignalRepositoryFromSignalRepositoryLive.pipe(Layer.provide(signalRepositoryCoreLive)),
)
