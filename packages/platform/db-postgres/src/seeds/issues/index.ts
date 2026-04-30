import { createRequire } from "node:module"
import {
  CENTROID_EMBEDDING_DIMENSIONS,
  CENTROID_EMBEDDING_MODEL,
  createIssueCentroid,
  type IssueCentroid,
  updateIssueCentroid,
} from "@domain/issues"
import { IssueId } from "@domain/shared"
import { SEED_ISSUE_FIXTURES, type SeedScope } from "@domain/shared/seeding"
import { parseEnvOptional } from "@platform/env"
import { Effect } from "effect"
import type { VoyageAIClient } from "voyageai"
import { issues } from "../../schema/issues.ts"
import { buildIssueLinkedScoreSeedRows } from "../scores/index.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

const require = createRequire(import.meta.url)

const EMBEDDING_BATCH_SIZE = 64

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

const fixtureScopedId = (index: number, scope: SeedScope): string =>
  index < NAMED_ISSUE_KEYS.length
    ? scope.cuid(`issue:${NAMED_ISSUE_KEYS[index]}`)
    : scope.cuid(`issue:extra:${index - NAMED_ISSUE_KEYS.length}`)

const fixtureScopedUuid = (index: number, scope: SeedScope): string =>
  index < NAMED_ISSUE_KEYS.length
    ? scope.uuid(`issue:${NAMED_ISSUE_KEYS[index]}:uuid`)
    : scope.uuid(`issue:extra:${index - NAMED_ISSUE_KEYS.length}:uuid`)

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

async function createVoyageClient(apiKey: string): Promise<VoyageAIClient> {
  const { VoyageAIClient } = require("voyageai") as {
    VoyageAIClient: new (config: { apiKey: string }) => VoyageAIClient
  }

  return new VoyageAIClient({ apiKey })
}

async function embedIssueFeedbacks(
  rows: readonly IssueLinkedScoreSeedRow[],
  apiKey: string,
): Promise<Map<string, number[]>> {
  const client = await createVoyageClient(apiKey)
  const embeddings = new Map<string, number[]>()

  for (let offset = 0; offset < rows.length; offset += EMBEDDING_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + EMBEDDING_BATCH_SIZE)
    const response = await client.embed({
      input: batch.map((row) => row.feedback),
      model: CENTROID_EMBEDDING_MODEL,
      inputType: "document",
      truncation: false,
      outputDimension: CENTROID_EMBEDDING_DIMENSIONS,
      outputDtype: "float",
    })

    const data = response.data ?? []
    if (data.length !== batch.length) {
      throw new Error(`Voyage returned ${data.length} embeddings for ${batch.length} inputs`)
    }

    for (const [index, item] of data.entries()) {
      const row = batch[index]
      if (!row) {
        throw new Error(`Missing batched score row at index ${offset + index}`)
      }

      const embedding = item.embedding
      if (!embedding) {
        throw new Error(`Voyage did not return an embedding for seeded score ${row.id}`)
      }

      embeddings.set(row.id, embedding)
    }
  }

  return embeddings
}

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
    base: deterministicUnitVector(seedKey, CENTROID_EMBEDDING_DIMENSIONS),
    mass: 1,
    clusteredAt,
  }
}

function issueFixtureDates(scope: SeedScope, issue: (typeof SEED_ISSUE_FIXTURES)[number]) {
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

  return {
    id: IssueId(input.issueId),
    uuid: input.issueUuid,
    organizationId: input.organizationId,
    projectId: input.projectId,
    name: input.issue.name,
    description: input.issue.description,
    source: input.issue.source,
    centroid,
    clusteredAt: centroid.clusteredAt,
    escalatedAt: fixtureDates.escalatedAt,
    resolvedAt: fixtureDates.resolvedAt,
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

        const voyageApiKey = Effect.runSync(parseEnvOptional("LAT_VOYAGE_API_KEY", "string"))
        const embeddingsByScoreId =
          voyageApiKey === undefined ? null : await embedIssueFeedbacks(issueLinkedScoreSeedRows, voyageApiKey)
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
          `  -> issues: ${issueRows.length} Acme support issue families (${voyageApiKey ? "Voyage centroid embeddings" : "deterministic random centroid fallback"})`,
        )
      },
      catch: (error) => new SeedError({ reason: "Failed to seed issues", cause: error }),
    }).pipe(Effect.asVoid),
}

export const issueSeeders: readonly Seeder[] = [seedIssues]
