import { AI } from "@domain/ai"
import type { OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import {
  TAXONOMY_CLUSTER_LOCK_TTL_SECONDS,
  TAXONOMY_FPS_SAMPLE_BUDGET_MAX,
  TAXONOMY_FPS_SAMPLE_BUDGET_MIN,
  TAXONOMY_LIST_ALL_BY_CLUSTER_MAX,
  TAXONOMY_NAMING_MODEL,
  TAXONOMY_NAMING_TIMEOUT_MS,
} from "../constants.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import { clamp, farthestPointSample } from "../helpers.ts"
import { withTaxonomyClusterLock } from "../locks.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { TaxonomyObservationRepository } from "../ports/taxonomy-observation-repository.ts"

export interface NameClusterInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly clusterId: TaxonomyCluster["id"]
  readonly now?: Date
}

export interface NameTaxonomyResult {
  readonly name: string
  readonly description: string
}

const candidateThemesSchema = z.object({
  candidates: z
    .array(z.object({ theme: z.string(), examples: z.array(z.number()) }))
    .min(1)
    .max(5),
})
const finalNameSchema = z.object({ name: z.string().min(3).max(80), description: z.string().min(20).max(280) })

const sampleBudget = (count: number): number =>
  Math.round(
    clamp(Math.round(Math.log2(count + 1)) * 2, TAXONOMY_FPS_SAMPLE_BUDGET_MIN, TAXONOMY_FPS_SAMPLE_BUDGET_MAX),
  )

const withNamingTimeout = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.timeoutOrElse({
      duration: TAXONOMY_NAMING_TIMEOUT_MS,
      orElse: () => Effect.fail(new Error("Taxonomy naming timed out")),
    }),
  )

const generateClusterName = (input: { readonly samples: readonly string[]; readonly parentName?: string }) =>
  withNamingTimeout(
    Effect.gen(function* () {
      const ai = yield* AI
      const sampleLines = input.samples.map((sample, index) => `${index}: ${sample}`).join("\n")
      const parentContext = input.parentName
        ? `These conversations are a sub-topic WITHIN the broader topic "${input.parentName}" — name what distinguishes them inside it; do not restate the parent topic.\n\n`
        : ""
      const map = yield* ai.generate({
        provider: TAXONOMY_NAMING_MODEL.provider,
        model: TAXONOMY_NAMING_MODEL.model,
        system:
          "proposeCandidateThemes: propose concise candidate themes for this conversation topic cluster. Return only schema-valid JSON.",
        prompt: `${parentContext}Samples:\n${sampleLines}`,
        schema: candidateThemesSchema,
        temperature: 0.2,
        maxTokens: 800,
      })
      const reduced = yield* ai.generate({
        provider: TAXONOMY_NAMING_MODEL.provider,
        model: TAXONOMY_NAMING_MODEL.model,
        system:
          "Collapse candidate themes into one clear conversation topic cluster name and description. The name should read like a support topic (what the conversations are about), not a behaviour. Return only schema-valid JSON with BOTH required string keys: name and description.",
        prompt: `${parentContext}Samples:\n${sampleLines}\n\nCandidates:\n${JSON.stringify(map.object.candidates)}\n\nReturn JSON exactly like {"name":"Short topic label","description":"One sentence describing what these conversations are about."}`,
        schema: finalNameSchema,
        temperature: 0.2,
        maxTokens: 1600,
      })
      return reduced.object
    }),
  )

const readableObservationSummary = (value: unknown): string | null => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  return trimmed
}

export const nameClusterUseCase = (input: NameClusterInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("taxonomy.clusterId", input.clusterId)
    const now = input.now ?? new Date()
    const clusters = yield* TaxonomyClusterRepository
    const observations = yield* TaxonomyObservationRepository
    const cluster = yield* clusters.findById(input.clusterId)
    const rows = yield* observations.listAllByCluster({
      organizationId: input.organizationId,
      projectId: input.projectId,
      clusterId: input.clusterId,
      limit: TAXONOMY_LIST_ALL_BY_CLUSTER_MAX,
    })
    const ranked = [...rows].sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
    const candidates = ranked.flatMap((row) => {
      const summary = readableObservationSummary(row.projectionMetadata.summary)
      return summary === null ? [] : [{ embedding: row.embedding, summary }]
    })
    if (candidates.length === 0) {
      const children = (yield* clusters.listActiveByProject({
        projectId: input.projectId,
        dimension: cluster.dimension,
      }))
        .filter((candidate) => candidate.parentClusterId === cluster.id)
        .filter((child) => child.name !== "Pending" && child.description.trim().length > 0)
        .sort((a, b) => b.observationCount - a.observationCount)
      if (children.length === 0) {
        return { name: cluster.name, description: cluster.description } satisfies NameTaxonomyResult
      }
      const generated = yield* generateClusterName({
        samples: children
          .slice(0, sampleBudget(cluster.observationCount))
          .map((child) => `${child.name}: ${child.description}`),
      })
      // Save under the cluster lock against a fresh read: the LLM call above
      // takes seconds, during which live online assignment mutates centroid/
      // counters on the same row. A stale full-row upsert would clobber them.
      yield* withTaxonomyClusterLock(
        {
          organizationId: input.organizationId,
          clusterId: input.clusterId,
          ttlSeconds: TAXONOMY_CLUSTER_LOCK_TTL_SECONDS,
        },
        Effect.gen(function* () {
          const fresh = yield* clusters.findById(input.clusterId)
          yield* clusters.save({
            ...fresh,
            name: generated.name,
            description: generated.description,
            clusteredAt: now,
            updatedAt: now,
          })
        }),
      )
      return generated satisfies NameTaxonomyResult
    }

    const selected = farthestPointSample(
      candidates.map((row) => row.embedding),
      sampleBudget(cluster.observationCount),
    )
    const samples = selected.flatMap((index) => {
      const row = candidates[index]
      return row === undefined ? [] : [row.summary]
    })
    const parent =
      cluster.parentClusterId === null
        ? null
        : yield* clusters.findById(cluster.parentClusterId).pipe(Effect.orElseSucceed(() => null))
    const generated = yield* generateClusterName({
      samples,
      ...(parent && parent.name !== "Pending" ? { parentName: parent.name } : {}),
    })
    // Save under the cluster lock against a fresh read: the LLM call above takes
    // seconds, during which live online assignment mutates centroid/counters on
    // the same row. A stale full-row upsert would clobber them.
    yield* withTaxonomyClusterLock(
      {
        organizationId: input.organizationId,
        clusterId: input.clusterId,
        ttlSeconds: TAXONOMY_CLUSTER_LOCK_TTL_SECONDS,
      },
      Effect.gen(function* () {
        const fresh = yield* clusters.findById(input.clusterId)
        yield* clusters.save({
          ...fresh,
          name: generated.name,
          description: generated.description,
          clusteredAt: now,
          updatedAt: now,
        })
      }),
    )
    return generated satisfies NameTaxonomyResult
  }).pipe(Effect.withSpan("taxonomy.nameCluster"))
