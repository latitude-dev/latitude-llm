import { AIEmbed, type AIError, EMBEDDING_DIMENSIONS, resolveEmbeddingConfig } from "@domain/ai"
import { SignalId } from "@domain/shared"
import { SEED_SIGNAL_FIXTURES, type SeedScope } from "@domain/shared/seeding"
import {
  createSignalCentroid,
  generateSignalSlug,
  type SignalCentroid,
  signalScoreEvidenceSchema,
  updateSignalCentroid,
} from "@domain/signals"
import { AIEmbedLive } from "@platform/ai"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { projects } from "../../schema/projects.ts"
import { signals } from "../../schema/signals.ts"
import { buildSignalLinkedScoreSeedRows } from "../scores/index.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

const EMBEDDING_CONCURRENCY = 8

type SignalLinkedScoreSeedRow = ReturnType<typeof buildSignalLinkedScoreSeedRows>[number]
type EmbeddedSignalLinkedScoreSeedRow = SignalLinkedScoreSeedRow & {
  readonly embedding: readonly number[]
}

const NAMED_SIGNAL_KEYS = [
  "warranty-fab",
  "combination",
  "logistics",
  "returns",
  "billing",
  "access",
  "installation",
  "flagger",
] as const

const fixtureScopedId = (index: number, scope: SeedScope): string =>
  index < NAMED_SIGNAL_KEYS.length
    ? scope.cuid(`issue:${NAMED_SIGNAL_KEYS[index]}`)
    : scope.cuid(`issue:extra:${index - NAMED_SIGNAL_KEYS.length}`)

const fixtureScopedUuid = (index: number, scope: SeedScope): string =>
  index < NAMED_SIGNAL_KEYS.length
    ? scope.uuid(`issue:${NAMED_SIGNAL_KEYS[index]}:uuid`)
    : scope.uuid(`issue:extra:${index - NAMED_SIGNAL_KEYS.length}:uuid`)

function hashString(input: string): number {
  let hash = 1779033703 ^ input.length

  for (let index = 0; index < input.length; index++) {
    hash = Math.imul(hash ^ input.charCodeAt(index), 3432918353)
    hash = (hash << 13) | (hash >>> 19)
  }

  return hash >>> 0 || 1
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), state | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

function deterministicUnitVector(seedKey: string, dimensions: number): number[] {
  const rand = seededRandom(hashString(seedKey))
  const vector = new Array<number>(dimensions)
  let magnitudeSquared = 0

  for (let index = 0; index < dimensions; index++) {
    const value = rand() - 0.5
    vector[index] = value
    magnitudeSquared += value * value
  }

  const magnitude = Math.sqrt(magnitudeSquared)
  if (magnitude === 0) {
    vector.fill(0)
    vector[0] = 1
    return vector
  }

  for (let index = 0; index < vector.length; index++) {
    vector[index] = (vector[index] ?? 0) / magnitude
  }

  return vector
}

function maxDate(dates: readonly Date[]): Date {
  return dates.reduce((latest, current) => (current.getTime() > latest.getTime() ? current : latest))
}

function minDate(dates: readonly Date[]): Date {
  return dates.reduce((earliest, current) => (current.getTime() < earliest.getTime() ? current : earliest))
}

interface EmbeddedSignalFeedbacks {
  readonly provider: string
  readonly embeddings: Map<string, number[]>
}

const embedSignalFeedbacks = (
  rows: readonly SignalLinkedScoreSeedRow[],
): Effect.Effect<EmbeddedSignalFeedbacks, AIError> =>
  Effect.gen(function* () {
    const embed = yield* AIEmbed
    const embeddingConfig = yield* resolveEmbeddingConfig()
    const embeddings = new Map<string, number[]>()

    yield* Effect.forEach(
      rows,
      (row) =>
        embed
          .embed({
            text: row.feedback,
            provider: embeddingConfig.provider,
            model: embeddingConfig.model,
            inputType: "document",
          })
          .pipe(Effect.map((result) => embeddings.set(row.id, result.embedding))),
      { concurrency: EMBEDDING_CONCURRENCY, discard: true },
    )

    return { provider: embeddingConfig.provider, embeddings }
  }).pipe(Effect.provide(AIEmbedLive))

function buildCentroidFromEmbeddings(
  rows: readonly EmbeddedSignalLinkedScoreSeedRow[],
): SignalCentroid & { clusteredAt: Date } {
  const sortedRows = [...rows].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
  const firstRow = sortedRows[0]

  if (!firstRow) {
    throw new Error("Cannot build an issue centroid without any score rows")
  }

  let centroid: SignalCentroid & { clusteredAt: Date } = {
    ...createSignalCentroid(),
    clusteredAt: firstRow.createdAt,
  }

  for (const row of sortedRows) {
    centroid = updateSignalCentroid({
      centroid,
      score: {
        embedding: row.embedding,
        sourceType: row.sourceType,
        createdAt: row.createdAt,
      },
      operation: "add",
      timestamp: row.createdAt,
    })
  }

  return centroid
}

function buildRandomFallbackCentroid(seedKey: string, clusteredAt: Date): SignalCentroid & { clusteredAt: Date } {
  return {
    ...createSignalCentroid(),
    base: deterministicUnitVector(seedKey, EMBEDDING_DIMENSIONS),
    mass: 1,
    clusteredAt,
  }
}

function signalFixtureDates(scope: SeedScope, issue: (typeof SEED_SIGNAL_FIXTURES)[number]) {
  return {
    createdAt: scope.dateDaysAgo(issue.createdDaysAgo, 14, 15),
    clusteredAt: scope.dateDaysAgo(issue.clusteredDaysAgo, 14, 15),
    updatedAt: scope.dateDaysAgo(issue.updatedDaysAgo, 16, 30),
    escalatedAt: issue.escalatedDaysAgo === null ? null : scope.dateDaysAgo(issue.escalatedDaysAgo, 9, 0),
    resolvedAt: issue.resolvedDaysAgo === null ? null : scope.dateDaysAgo(issue.resolvedDaysAgo, 11, 30),
    ignoredAt: issue.ignoredDaysAgo === null ? null : scope.dateDaysAgo(issue.ignoredDaysAgo, 13, 10),
    regressedAt: issue.regressedDaysAgo === null ? null : scope.dateDaysAgo(issue.regressedDaysAgo, 10, 20),
    // Ignored fixtures share their ignored day, so the auto-mute lands on the same instant.
    mutedAt: issue.mutedDaysAgo === null ? null : scope.dateDaysAgo(issue.mutedDaysAgo, 13, 10),
  }
}

function buildSignalRow(input: {
  readonly scope: SeedScope
  readonly issue: (typeof SEED_SIGNAL_FIXTURES)[number]
  readonly signalId: string
  readonly signalUuid: string
  readonly slug: string
  readonly organizationId: string
  readonly projectId: string
  readonly signalScores: readonly SignalLinkedScoreSeedRow[]
  readonly embeddedSignalScores: readonly EmbeddedSignalLinkedScoreSeedRow[] | null
}): typeof signals.$inferInsert {
  const fixtureDates = signalFixtureDates(input.scope, input.issue)
  const sortedSignalScores = [...input.signalScores].sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
  )
  const firstSeenAt = sortedSignalScores[0]?.createdAt ?? fixtureDates.createdAt
  const lastSeenAt = sortedSignalScores.at(-1)?.createdAt ?? fixtureDates.clusteredAt
  const centroid =
    input.embeddedSignalScores && input.embeddedSignalScores.length > 0
      ? buildCentroidFromEmbeddings(input.embeddedSignalScores)
      : buildRandomFallbackCentroid(input.signalUuid, lastSeenAt)
  const createdAt = minDate([fixtureDates.createdAt, firstSeenAt])
  const updatedAt = maxDate(
    [
      fixtureDates.updatedAt,
      centroid.clusteredAt,
      fixtureDates.escalatedAt,
      fixtureDates.resolvedAt,
      fixtureDates.ignoredAt,
      fixtureDates.regressedAt,
      fixtureDates.mutedAt,
    ].filter((date): date is Date => date !== null),
  )

  return {
    id: SignalId(input.signalId),
    organizationId: input.organizationId,
    projectId: input.projectId,
    // JIRA-style slug from the same generator the app uses (project prefix +
    // cuid suffix), so seeded signals are referenceable by the GitHub integration.
    slug: input.slug,
    name: input.issue.name,
    description: input.issue.description,
    source: input.issue.source,
    scoreEvidence: signalScoreEvidenceSchema.array().parse(input.issue.scoreEvidence),
    centroid,
    clusteredAt: centroid.clusteredAt,
    promotedAt: input.issue.unpromoted ? null : createdAt,
    resolvedAt: fixtureDates.resolvedAt,
    ignoredAt: fixtureDates.ignoredAt,
    regressedAt: fixtureDates.regressedAt,
    mutedAt: fixtureDates.mutedAt,
    createdAt,
    updatedAt,
  }
}

const seedSignals: Seeder = {
  name: "signals/acme-support-issue-families",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: async () => {
        const signalLinkedScoreSeedRows = buildSignalLinkedScoreSeedRows(ctx.scope)

        const signalScoresBySignalId = new Map<string, SignalLinkedScoreSeedRow[]>()
        for (const row of signalLinkedScoreSeedRows) {
          const signalId = row.signalId
          if (signalId === null) {
            continue
          }

          const existing = signalScoresBySignalId.get(signalId)
          if (existing) {
            existing.push(row)
          } else {
            signalScoresBySignalId.set(signalId, [row])
          }
        }

        // Embeds through the configured LAT_AI_EMBEDDING_* provider; when it is
        // unavailable (no credentials, unreachable) the seeds degrade to
        // deterministic random centroids instead of failing.
        const embedded = await Effect.runPromise(
          embedSignalFeedbacks(signalLinkedScoreSeedRows).pipe(
            Effect.catchTag("AIError", (error) =>
              Effect.sync(() => {
                console.log(`  -> signals: embedding provider unavailable (${error.message})`)
                return null
              }),
            ),
          ),
        )
        const embeddingsByScoreId = embedded?.embeddings ?? null

        // Slugs use the app's own generator (project prefix + cuid suffix), assigned
        // up-front and kept unique within this org-scoped run so they satisfy the
        // organization-unique index and are matchable by the GitHub integration.
        const [project] = await ctx.db
          .select({ slug: projects.slug })
          .from(projects)
          .where(eq(projects.id, ctx.scope.projectId))
        const projectSlug = project?.slug ?? "signals"
        const usedSlugs = new Set<string>()
        const slugByIndex: string[] = []
        for (let i = 0; i < SEED_SIGNAL_FIXTURES.length; i++) {
          const slug = await Effect.runPromise(
            generateSignalSlug({
              projectSlug,
              count: (candidate) => Effect.sync(() => (usedSlugs.has(candidate) ? 1 : 0)),
            }),
          )
          usedSlugs.add(slug)
          slugByIndex.push(slug)
        }

        const signalRows = SEED_SIGNAL_FIXTURES.map((issue, index) => {
          const signalId = fixtureScopedId(index, ctx.scope)
          const slug = slugByIndex[index]
          if (slug === undefined) throw new Error(`Missing generated slug for signal index ${index}`)
          const signalUuid = fixtureScopedUuid(index, ctx.scope)
          const signalScores = signalScoresBySignalId.get(signalId) ?? []
          const embeddedSignalScores =
            embeddingsByScoreId === null
              ? null
              : signalScores.map((row) => {
                  const embedding = embeddingsByScoreId.get(row.id)
                  if (!embedding) {
                    throw new Error(`Missing seeded issue embedding for score ${row.id}`)
                  }

                  return {
                    ...row,
                    embedding,
                  } satisfies EmbeddedSignalLinkedScoreSeedRow
                })

          return buildSignalRow({
            scope: ctx.scope,
            issue,
            signalId,
            signalUuid,
            slug,
            organizationId: ctx.scope.organizationId,
            projectId: ctx.scope.projectId,
            signalScores,
            embeddedSignalScores,
          })
        })

        for (const row of signalRows) {
          const { id, ...set } = row
          await ctx.db.insert(signals).values(row).onConflictDoUpdate({
            target: signals.id,
            set,
          })
        }

        console.log(
          `  -> signals: ${signalRows.length} Acme support issue families (${embedded ? `${embedded.provider} centroid embeddings` : "deterministic random centroid fallback"})`,
        )
      },
      catch: (error) => new SeedError({ reason: "Failed to seed signals", cause: error }),
    }).pipe(Effect.asVoid),
}

export const signalSeeders: readonly Seeder[] = [seedSignals]
