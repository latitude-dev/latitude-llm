import { AI } from "@domain/ai"
import type { OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import {
  TAXONOMY_FPS_SAMPLE_BUDGET_MAX,
  TAXONOMY_FPS_SAMPLE_BUDGET_MIN,
  TAXONOMY_LIST_ALL_BY_CLUSTER_MAX,
  TAXONOMY_NAMING_MODEL,
  TAXONOMY_NAMING_TIMEOUT_MS,
} from "../constants.ts"
import type { TaxonomyCategory } from "../entities/category.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import { clamp, farthestPointSample, normalizeTaxonomyCentroid } from "../helpers.ts"
import { BehaviorObservationRepository } from "../ports/behavior-observation-repository.ts"
import { TaxonomyCategoryRepository } from "../ports/taxonomy-category-repository.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"

export interface NameClusterInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly clusterId: TaxonomyCluster["id"]
  readonly now?: Date
}

export interface NameCategoryInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly categoryId: TaxonomyCategory["id"]
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

const generateClusterName = (input: { readonly samples: readonly string[] }) =>
  withNamingTimeout(
    Effect.gen(function* () {
      const ai = yield* AI
      const sampleLines = input.samples.map((sample, index) => `${index}: ${sample}`).join("\n")
      const map = yield* ai.generate({
        provider: TAXONOMY_NAMING_MODEL.provider,
        model: TAXONOMY_NAMING_MODEL.model,
        system:
          "proposeCandidateThemes: propose concise candidate themes for this behavior taxonomy cluster. Return only schema-valid JSON.",
        prompt: `Samples:\n${sampleLines}`,
        schema: candidateThemesSchema,
        temperature: 0.2,
        maxTokens: 800,
      })
      const reduced = yield* ai.generate({
        provider: TAXONOMY_NAMING_MODEL.provider,
        model: TAXONOMY_NAMING_MODEL.model,
        system:
          "Collapse candidate themes into one clear behavior taxonomy cluster name and description. Return only schema-valid JSON with BOTH required string keys: name and description.",
        prompt: `Samples:\n${sampleLines}\n\nCandidates:\n${JSON.stringify(map.object.candidates)}\n\nReturn JSON exactly like {"name":"Short behavior label","description":"One sentence describing the repeated behavior."}`,
        schema: finalNameSchema,
        temperature: 0.2,
        maxTokens: 1600,
      })
      return reduced.object
    }),
  )

const generateCategoryName = (input: { readonly samples: readonly string[] }) =>
  withNamingTimeout(
    Effect.gen(function* () {
      const ai = yield* AI
      const sampleLines = input.samples.map((sample, index) => `${index}: ${sample}`).join("\n")
      const generated = yield* ai.generate({
        provider: TAXONOMY_NAMING_MODEL.provider,
        model: TAXONOMY_NAMING_MODEL.model,
        system:
          "Name this customer-support behavior taxonomy category from its member clusters. Use business/domain language from the cluster names and descriptions. Do not mention taxonomy mechanics, pending states, uncategorized behaviors, clustering, or assignment. Return only schema-valid JSON with BOTH required string keys: name and description.",
        prompt: `Member clusters:\n${sampleLines}\n\nWrite a user-facing category label that summarizes what these behaviors are about. Bad labels: Pending States, Uncategorized Behaviors, Miscellaneous, Other. Good labels: Order Management Requests, Flight Booking Support, Customer Information Gathering.\n\nReturn JSON exactly like {"name":"Short customer-support category label","description":"One sentence describing what these related customer behaviors have in common."}`,
        schema: finalNameSchema,
        temperature: 0.2,
        maxTokens: 800,
      })
      return generated.object
    }),
  )

export const nameClusterUseCase = (input: NameClusterInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("taxonomy.clusterId", input.clusterId)
    const now = input.now ?? new Date()
    const clusters = yield* TaxonomyClusterRepository
    const observations = yield* BehaviorObservationRepository
    const cluster = yield* clusters.findById(input.clusterId)
    const rows = yield* observations.listAllByCluster({
      organizationId: input.organizationId,
      projectId: input.projectId,
      clusterId: input.clusterId,
      limit: TAXONOMY_LIST_ALL_BY_CLUSTER_MAX,
    })
    const ranked = [...rows].sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
    const selected = farthestPointSample(
      ranked.map((row) => row.embedding),
      sampleBudget(cluster.observationCount),
    )
    const samples = selected.map((index) => ranked[index]?.summary).filter((summary) => summary !== undefined)
    const generated = yield* generateClusterName({ samples })
    yield* clusters.save({
      ...cluster,
      name: generated.name,
      description: generated.description,
      clusteredAt: now,
      updatedAt: now,
    })
    return generated satisfies NameTaxonomyResult
  }).pipe(Effect.withSpan("taxonomy.nameCluster"))

export const nameCategoryUseCase = (input: NameCategoryInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("taxonomy.categoryId", input.categoryId)
    const now = input.now ?? new Date()
    const categories = yield* TaxonomyCategoryRepository
    const clusters = yield* TaxonomyClusterRepository
    const category = yield* categories.findById(input.categoryId)
    const memberClusters = (yield* clusters.listActiveByProject({
      projectId: input.projectId,
    })).filter(
      (cluster) =>
        cluster.parentCategoryId === input.categoryId && normalizeTaxonomyCentroid(cluster.centroid).length > 0,
    )
    const unnamedMemberClusters = memberClusters.filter(
      (cluster) => cluster.name === "Pending" || cluster.description.trim().length === 0,
    )
    if (unnamedMemberClusters.length > 0) {
      return yield* Effect.fail(
        new Error(
          `Cannot name taxonomy category until member clusters are named (${unnamedMemberClusters.length.toString()} pending)`,
        ),
      )
    }

    const selected = farthestPointSample(
      memberClusters.map((cluster) => normalizeTaxonomyCentroid(cluster.centroid)),
      sampleBudget(memberClusters.length),
    )
    const samples = selected
      .map((index) => memberClusters[index])
      .filter((cluster) => cluster !== undefined)
      .map((cluster) => `${cluster.name}: ${cluster.description}`)
    const generated = yield* generateCategoryName({ samples })
    if (/\bpending\s+states?\b|\buncategorized\b|\bmiscellaneous\b|\bother\s+behaviors?\b/i.test(generated.name)) {
      return yield* Effect.fail(new Error(`Generated unusable taxonomy category name: ${generated.name}`))
    }
    yield* categories.save({
      ...category,
      name: generated.name,
      description: generated.description,
      clusteredAt: now,
      updatedAt: now,
    })
    return generated satisfies NameTaxonomyResult
  }).pipe(Effect.withSpan("taxonomy.nameCategory"))
