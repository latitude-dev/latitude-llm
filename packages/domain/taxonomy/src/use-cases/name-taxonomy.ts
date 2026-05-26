import { AI } from "@domain/ai"
import type { OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import { TAXONOMY_FPS_SAMPLE_BUDGET_MAX, TAXONOMY_FPS_SAMPLE_BUDGET_MIN, TAXONOMY_NAMING_MODEL } from "../constants.ts"
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

const generateName = (input: { readonly subject: "cluster" | "category"; readonly samples: readonly string[] }) =>
  Effect.gen(function* () {
    const ai = yield* AI
    const sampleLines = input.samples.map((sample, index) => `${index}: ${sample}`).join("\n")
    const map = yield* ai.generate({
      provider: TAXONOMY_NAMING_MODEL.provider,
      model: TAXONOMY_NAMING_MODEL.model,
      system: `proposeCandidateThemes: propose concise candidate themes for this behavior taxonomy ${input.subject}. Return only schema-valid JSON.`,
      prompt: `Samples:\n${sampleLines}`,
      schema: candidateThemesSchema,
      temperature: 0.2,
      maxTokens: 800,
    })
    const reduced = yield* ai.generate({
      provider: TAXONOMY_NAMING_MODEL.provider,
      model: TAXONOMY_NAMING_MODEL.model,
      system: `Collapse candidate themes into one clear behavior taxonomy ${input.subject} name and description. Return only schema-valid JSON.`,
      prompt: `Samples:\n${sampleLines}\n\nCandidates:\n${JSON.stringify(map.object.candidates)}`,
      schema: finalNameSchema,
      temperature: 0.2,
      maxTokens: 500,
    })
    return reduced.object
  })

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
    })
    const ranked = [...rows].sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
    const selected = farthestPointSample(
      ranked.map((row) => row.embedding),
      sampleBudget(cluster.observationCount),
    )
    const samples = selected.map((index) => ranked[index]?.summary).filter((summary) => summary !== undefined)
    const generated = yield* generateName({ subject: "cluster", samples })
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
    const selected = farthestPointSample(
      memberClusters.map((cluster) => normalizeTaxonomyCentroid(cluster.centroid)),
      sampleBudget(memberClusters.length),
    )
    const samples = selected
      .map((index) => memberClusters[index])
      .filter((cluster) => cluster !== undefined)
      .map((cluster) => `${cluster.name}: ${cluster.description}`)
    const generated = yield* generateName({ subject: "category", samples })
    yield* categories.save({
      ...category,
      name: generated.name,
      description: generated.description,
      clusteredAt: now,
      updatedAt: now,
    })
    return generated satisfies NameTaxonomyResult
  }).pipe(Effect.withSpan("taxonomy.nameCategory"))
