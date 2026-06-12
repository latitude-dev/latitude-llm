import { AIEmbed, type AIError, EMBEDDING_DIMENSIONS, resolveEmbeddingConfig } from "@domain/ai"
import { createIssueCentroid, type IssueCentroid, updateIssueCentroid } from "@domain/issues"
import { IssueId, toSlug } from "@domain/shared"
import { SEED_ISSUE_FIXTURES, SEED_REGRESSED_ISSUE_IDS, type SeedScope } from "@domain/shared/seeding"
import { AIEmbedLive } from "@platform/ai"
import { Effect } from "effect"
import { issues } from "../../schema/issues.ts"
import { buildIssueLinkedScoreSeedRows } from "../scores/index.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

const EMBEDDING_CONCURRENCY = 8

type IssueLinkedScoreSeedRow = ReturnType<typeof buildIssueLinkedScoreSeedRows>[number]
type EmbeddedIssueLinkedScoreSeedRow = IssueLinkedScoreSeedRow & {
  readonly embedding: readonly number[]
}

const NAMED_ISSUE_KEYS = [
  "warranty-fab",
  "combination",
  "logistics",
  "returns",
  "billing",
  "access",
  "installation",
  "flagger",
] as const

export const fixtureScopedId = (index: number, scope: SeedScope): string =>
  index < NAMED_ISSUE_KEYS.length
    ? scope.cuid(`issue:${NAMED_ISSUE_KEYS[index]}`)
    : scope.cuid(`issue:extra:${index - NAMED_ISSUE_KEYS.length}`)

const fixtureScopedUuid = (index: number, scope: SeedScope): string =>
  index < NAMED_ISSUE_KEYS.length
    ? scope.uuid(`issue:${NAMED_ISSUE_KEYS[index]}:uuid`)
    : scope.uuid(`issue:extra:${index - NAMED_ISSUE_KEYS.length}:uuid`)

/** Stable key per fixture index — used to namespace cross-seeder ids
 * (e.g. alert_incidents rows that reference these issues). */
export const fixtureScopedKey = (index: number): string =>
  index < NAMED_ISSUE_KEYS.length ? (NAMED_ISSUE_KEYS[index] as string) : `extra:${index - NAMED_ISSUE_KEYS.length}`

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

interface EmbeddedIssueFeedbacks {
  readonly provider: string
  readonly embeddings: Map<string, number[]>
}

const embedIssueFeedbacks = (
  rows: readonly IssueLinkedScoreSeedRow[],
): Effect.Effect<EmbeddedIssueFeedbacks, AIError> =>
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
  rows: readonly EmbeddedIssueLinkedScoreSeedRow[],
): IssueCentroid & { clusteredAt: Date } {
  const sortedRows = [...rows].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
  const firstRow = sortedRows[0]

  if (!firstRow) {
    throw new Error("Cannot build an issue centroid without any score rows")
  }

  let centroid: IssueCentroid & { clusteredAt: Date } = {
    ...createIssueCentroid(),
    clusteredAt: firstRow.createdAt,
  }

  for (const row of sortedRows) {
    centroid = updateIssueCentroid({
      centroid,
      score: {
        embedding: row.embedding,
        source: row.source,
        createdAt: row.createdAt,
      },
      operation: "add",
      timestamp: row.createdAt,
    })
  }

  return centroid
}

function buildRandomFallbackCentroid(seedKey: string, clusteredAt: Date): IssueCentroid & { clusteredAt: Date } {
  return {
    ...createIssueCentroid(),
    base: deterministicUnitVector(seedKey, EMBEDDING_DIMENSIONS),
    mass: 1,
    clusteredAt,
  }
}

export function issueFixtureDates(scope: SeedScope, issue: (typeof SEED_ISSUE_FIXTURES)[number]) {
  return {
    createdAt: scope.dateDaysAgo(issue.createdDaysAgo, 14, 15),
    clusteredAt: scope.dateDaysAgo(issue.clusteredDaysAgo, 14, 15),
    updatedAt: scope.dateDaysAgo(issue.updatedDaysAgo, 16, 30),
    escalatedAt: issue.escalatedDaysAgo === null ? null : scope.dateDaysAgo(issue.escalatedDaysAgo, 9, 0),
    resolvedAt: issue.resolvedDaysAgo === null ? null : scope.dateDaysAgo(issue.resolvedDaysAgo, 11, 30),
    ignoredAt: issue.ignoredDaysAgo === null ? null : scope.dateDaysAgo(issue.ignoredDaysAgo, 13, 10),
  }
}

function buildIssueRow(input: {
  readonly scope: SeedScope
  readonly issue: (typeof SEED_ISSUE_FIXTURES)[number]
  readonly issueId: string
  readonly issueUuid: string
  readonly organizationId: string
  readonly projectId: string
  readonly issueScores: readonly IssueLinkedScoreSeedRow[]
  readonly embeddedIssueScores: readonly EmbeddedIssueLinkedScoreSeedRow[] | null
}): typeof issues.$inferInsert {
  const fixtureDates = issueFixtureDates(input.scope, input.issue)
  const sortedIssueScores = [...input.issueScores].sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
  )
  const firstSeenAt = sortedIssueScores[0]?.createdAt ?? fixtureDates.createdAt
  const lastSeenAt = sortedIssueScores.at(-1)?.createdAt ?? fixtureDates.clusteredAt
  const centroid =
    input.embeddedIssueScores && input.embeddedIssueScores.length > 0
      ? buildCentroidFromEmbeddings(input.embeddedIssueScores)
      : buildRandomFallbackCentroid(input.issueUuid, lastSeenAt)
  const createdAt = minDate([fixtureDates.createdAt, firstSeenAt])
  const updatedAt = maxDate(
    [
      fixtureDates.updatedAt,
      centroid.clusteredAt,
      fixtureDates.escalatedAt,
      fixtureDates.resolvedAt,
      fixtureDates.ignoredAt,
    ].filter((date): date is Date => date !== null),
  )

  // Regression-demo issues are kept un-resolved on purpose: the
  // `Regressed` derived state requires `resolvedAt IS NULL` plus an
  // `issue.regressed` alert_incident, which the alert-incidents seeder
  // inserts for these ids. Production behavior is the same — when
  // `assign-score-to-issue` reifies a regression it clears `resolvedAt`.
  const isRegressedDemo = SEED_REGRESSED_ISSUE_IDS.includes(input.issueId)
  const resolvedAt = isRegressedDemo ? null : fixtureDates.resolvedAt

  return {
    id: IssueId(input.issueId),
    organizationId: input.organizationId,
    projectId: input.projectId,
    // Seeds run before the migration backfill is exercised; we provide a slug
    // up-front from the issue's name. Seed names are unique within the demo
    // project so a plain `toSlug(name)` is collision-free.
    slug: toSlug(input.issue.name),
    name: input.issue.name,
    description: input.issue.description,
    source: input.issue.source,
    centroid,
    clusteredAt: centroid.clusteredAt,
    // escalatedAt is intentionally not written: the column is dormant and
    // "currently escalating" is sourced from open `alert_incidents` rows
    // by `IssueRepository`.
    escalatedAt: null,
    resolvedAt,
    ignoredAt: fixtureDates.ignoredAt,
    createdAt,
    updatedAt,
  }
}

const seedIssues: Seeder = {
  name: "issues/acme-support-issue-families",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: async () => {
        const issueLinkedScoreSeedRows = buildIssueLinkedScoreSeedRows(ctx.scope)

        const issueScoresByIssueId = new Map<string, IssueLinkedScoreSeedRow[]>()
        for (const row of issueLinkedScoreSeedRows) {
          const issueId = row.issueId
          if (issueId === null) {
            continue
          }

          const existing = issueScoresByIssueId.get(issueId)
          if (existing) {
            existing.push(row)
          } else {
            issueScoresByIssueId.set(issueId, [row])
          }
        }

        // Embeds through the configured LAT_AI_EMBEDDING_* provider; when it is
        // unavailable (no credentials, unreachable) the seeds degrade to
        // deterministic random centroids instead of failing.
        const embedded = await Effect.runPromise(
          embedIssueFeedbacks(issueLinkedScoreSeedRows).pipe(
            Effect.catchTag("AIError", (error) =>
              Effect.sync(() => {
                console.log(`  -> issues: embedding provider unavailable (${error.message})`)
                return null
              }),
            ),
          ),
        )
        const embeddingsByScoreId = embedded?.embeddings ?? null
        const issueRows = SEED_ISSUE_FIXTURES.map((issue, index) => {
          const issueId = fixtureScopedId(index, ctx.scope)
          const issueUuid = fixtureScopedUuid(index, ctx.scope)
          const issueScores = issueScoresByIssueId.get(issueId) ?? []
          const embeddedIssueScores =
            embeddingsByScoreId === null
              ? null
              : issueScores.map((row) => {
                  const embedding = embeddingsByScoreId.get(row.id)
                  if (!embedding) {
                    throw new Error(`Missing seeded issue embedding for score ${row.id}`)
                  }

                  return {
                    ...row,
                    embedding,
                  } satisfies EmbeddedIssueLinkedScoreSeedRow
                })

          return buildIssueRow({
            scope: ctx.scope,
            issue,
            issueId,
            issueUuid,
            organizationId: ctx.scope.organizationId,
            projectId: ctx.scope.projectId,
            issueScores,
            embeddedIssueScores,
          })
        })

        for (const row of issueRows) {
          const { id, ...set } = row
          await ctx.db.insert(issues).values(row).onConflictDoUpdate({
            target: issues.id,
            set,
          })
        }

        console.log(
          `  -> issues: ${issueRows.length} Acme support issue families (${embedded ? `${embedded.provider} centroid embeddings` : "deterministic random centroid fallback"})`,
        )
      },
      catch: (error) => new SeedError({ reason: "Failed to seed issues", cause: error }),
    }).pipe(Effect.asVoid),
}

export const issueSeeders: readonly Seeder[] = [seedIssues]
