import {
  AI,
  AI_GENERATE_TELEMETRY_SPAN_NAMES,
  AI_GENERATE_TELEMETRY_TAGS,
  buildProjectScopedAiMetadata,
  resolveGenerationConfig,
} from "@domain/ai"
import { LATITUDE_TELEMETRY_PROJECT_SLUGS, type OrganizationId, type ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import {
  TAXONOMY_CLUSTER_LOCK_TTL_SECONDS,
  TAXONOMY_DEFAULT_NAMING_MODEL,
  TAXONOMY_FPS_SAMPLE_BUDGET_MAX,
  TAXONOMY_FPS_SAMPLE_BUDGET_MIN,
  TAXONOMY_LIST_ALL_BY_CLUSTER_MAX,
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

const TOPIC_POLICY =
  "Conversation topic clusters describe what users come to do (e.g. 'Order Status', 'Returns and Refunds', 'Account Billing'). They are NOT conversational rituals (no 'user greets', 'user thanks', 'user says hello'), NOT model behaviours (no 'agent apologizes'), and NOT generic dispositions ('frustrated user'). If samples disagree, name the dominant topic of the conversation transcripts."

/**
 * Normalize a name so we can detect collisions ("Order Status" vs "order
 * status" vs "Order-Status" should all be treated as the same name).
 */
const normalizeName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

interface GenerateInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly clusterId: TaxonomyCluster["id"]
  readonly mode: "leaf" | "interior" | "root"
  readonly samples: readonly string[]
  readonly parentName?: string
  readonly parentDescription?: string
  /** Names this cluster's name MUST NOT match. Parent + siblings + (for interiors) children. */
  readonly forbiddenNames: readonly string[]
  /** Extra "do not pick this exact name" overlay when retrying after a collision. */
  readonly retryForbiddenName?: string
}

const generateClusterName = (input: GenerateInput) =>
  withNamingTimeout(
    Effect.gen(function* () {
      const ai = yield* AI
      const sampleLines = input.samples.map((sample, index) => `${index}: ${sample}`).join("\n")
      const parentContext = input.parentName
        ? `These conversations are a sub-topic WITHIN the broader topic "${input.parentName}"${
            input.parentDescription && input.parentDescription.length > 0 ? ` (${input.parentDescription})` : ""
          }. Your name MUST be strictly more specific than "${input.parentName}" — never restate or paraphrase it.\n\n`
        : ""
      const forbidden = [...new Set(input.forbiddenNames.filter((name) => name.trim().length > 0))]
      const forbiddenContext =
        forbidden.length > 0
          ? `FORBIDDEN names — your "name" field must not match or paraphrase any of these (they're already used by the parent, siblings, or your own children):\n${forbidden.map((name) => `- ${name}`).join("\n")}\n\n`
          : ""
      const retryContext = input.retryForbiddenName
        ? `Previous attempt returned "${input.retryForbiddenName}" which is forbidden. Pick a DIFFERENT name.\n\n`
        : ""
      const modeContext =
        input.mode === "root"
          ? "These are NOT raw conversation samples — they are the names and descriptions of the TOP-LEVEL categories in this entire project's taxonomy. Your job is to produce a SHORT umbrella label that captures the WHOLE project. It MUST cover EVERY listed top-level category — never name something that fits one branch but excludes the others. A correct label feels like 'Customer Support Conversations', 'Internal Helpdesk Tickets', or '<Company> Customer Interactions' — broad and category-neutral. The label must not be identical to or paraphrase any listed category."
          : input.mode === "interior"
            ? "These are NOT raw conversation samples — they are the names and descriptions of THIS cluster's CHILD topics. Your job is to find a single short umbrella TOPIC that subsumes all of them and is BROADER than every child. The umbrella must not be identical or near-identical to any child."
            : "These are raw conversation samples. Find the dominant topic across them."
      const modelConfig = yield* resolveGenerationConfig("TAXONOMY_NAMING", TAXONOMY_DEFAULT_NAMING_MODEL)
      const map = yield* ai.generate({
        ...modelConfig,
        telemetry: {
          spanName: AI_GENERATE_TELEMETRY_SPAN_NAMES.taxonomyProposeThemes,
          project: LATITUDE_TELEMETRY_PROJECT_SLUGS.taxonomy,
          tags: [...AI_GENERATE_TELEMETRY_TAGS.taxonomyProposeThemes],
          metadata: buildProjectScopedAiMetadata(
            { organizationId: input.organizationId, projectId: input.projectId },
            { clusterId: input.clusterId, mode: input.mode },
          ),
        },
        system: `proposeCandidateThemes: propose concise candidate conversation TOPIC themes for this cluster. ${TOPIC_POLICY} ${modeContext} Return only schema-valid JSON.`,
        prompt: `${parentContext}${forbiddenContext}${retryContext}Samples:\n${sampleLines}`,
        schema: candidateThemesSchema,
      })
      const reduced = yield* ai.generate({
        ...modelConfig,
        telemetry: {
          spanName: AI_GENERATE_TELEMETRY_SPAN_NAMES.taxonomyNameCluster,
          project: LATITUDE_TELEMETRY_PROJECT_SLUGS.taxonomy,
          tags: [...AI_GENERATE_TELEMETRY_TAGS.taxonomyNameCluster],
          metadata: buildProjectScopedAiMetadata(
            { organizationId: input.organizationId, projectId: input.projectId },
            { clusterId: input.clusterId, mode: input.mode },
          ),
        },
        system: `Collapse candidate themes into ONE conversation TOPIC name (2-5 words) and a one-sentence description of what the user is trying to do. ${TOPIC_POLICY} ${modeContext} The name MUST be clearly distinct from any forbidden names provided. Return only schema-valid JSON with BOTH required string keys: name and description.`,
        prompt: `${parentContext}${forbiddenContext}${retryContext}Samples:\n${sampleLines}\n\nCandidates:\n${JSON.stringify(map.object.candidates)}\n\nReturn JSON exactly like {"name":"Short topic label","description":"One sentence describing what these conversations are about."}`,
        schema: finalNameSchema,
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

const generateWithCollisionGuard = (input: Omit<GenerateInput, "retryForbiddenName">) =>
  Effect.gen(function* () {
    const forbiddenNormalized = new Set(input.forbiddenNames.map(normalizeName).filter((n) => n.length > 0))
    const firstAttempt = yield* generateClusterName(input)
    if (!forbiddenNormalized.has(normalizeName(firstAttempt.name))) {
      return firstAttempt
    }
    // Retry once with the offending name surfaced explicitly.
    const retry = yield* generateClusterName({ ...input, retryForbiddenName: firstAttempt.name })
    if (!forbiddenNormalized.has(normalizeName(retry.name))) {
      return retry
    }
    // Last-resort fallback: keep the LLM's second attempt but suffix it so
    // the tree still shows distinct names. We never silently overwrite with
    // a forbidden value because that breaks the assertTaxonomyQuality
    // duplicate-name gate.
    return {
      name: `${retry.name} (subtopic)`,
      description: retry.description,
    }
  })

export const nameClusterUseCase = (input: NameClusterInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("taxonomy.clusterId", input.clusterId)
    const now = input.now ?? new Date()
    const clusters = yield* TaxonomyClusterRepository
    const observations = yield* TaxonomyObservationRepository
    const cluster = yield* clusters.findById(input.clusterId)

    const parent =
      cluster.parentClusterId === null
        ? null
        : yield* clusters.findById(cluster.parentClusterId).pipe(Effect.orElseSucceed(() => null))
    const siblings = (yield* clusters.listActiveByProject({
      projectId: input.projectId,
      dimension: cluster.dimension,
      parentClusterId: cluster.parentClusterId,
    })).filter((candidate) => candidate.id !== cluster.id && candidate.name !== "Pending")
    const children = (yield* clusters.listActiveByProject({
      projectId: input.projectId,
      dimension: cluster.dimension,
      parentClusterId: cluster.id,
    })).filter((child) => child.name !== "Pending" && child.description.trim().length > 0)

    const rows = yield* observations.listAllByCluster({
      organizationId: input.organizationId,
      projectId: input.projectId,
      clusterId: input.clusterId,
      limit: TAXONOMY_LIST_ALL_BY_CLUSTER_MAX,
    })
    const ranked = [...rows].sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
    const memberSummaries = ranked.flatMap((row) => {
      const summary = readableObservationSummary(row.projectionMetadata.summary)
      return summary === null ? [] : [{ embedding: row.embedding, summary }]
    })

    let generated: NameTaxonomyResult
    if (memberSummaries.length > 0) {
      // Leaf path (or interior with residue): name from direct member text.
      const selected = farthestPointSample(
        memberSummaries.map((row) => row.embedding),
        sampleBudget(cluster.observationCount),
      )
      const samples = selected.flatMap((index) => {
        const row = memberSummaries[index]
        return row === undefined ? [] : [row.summary]
      })
      generated = yield* generateWithCollisionGuard({
        organizationId: input.organizationId,
        projectId: input.projectId,
        clusterId: input.clusterId,
        mode: "leaf",
        samples,
        forbiddenNames: [
          ...(parent && parent.name !== "Pending" ? [parent.name] : []),
          ...siblings.map((sibling) => sibling.name),
          ...children.map((child) => child.name),
        ],
        ...(parent && parent.name !== "Pending" ? { parentName: parent.name } : {}),
        ...(parent && parent.description.trim().length > 0 ? { parentDescription: parent.description } : {}),
      })
    } else if (children.length > 0) {
      // Interior path: collapse already-named children into a broader umbrella.
      // Naming is run deepest-first by the workflow so children are stable.
      // The root cluster (no parent) uses a different mode because the LLM
      // tends to pick a name that fits its biggest child instead of a true
      // project-wide superset when run through the regular "interior" prompt.
      const isRoot = parent === null
      generated = yield* generateWithCollisionGuard({
        organizationId: input.organizationId,
        projectId: input.projectId,
        clusterId: input.clusterId,
        mode: isRoot ? "root" : "interior",
        samples: children
          .slice(0, sampleBudget(children.reduce((sum, child) => sum + child.observationCount, 0)))
          .map((child) => `${child.name}: ${child.description}`),
        forbiddenNames: [
          ...(parent && parent.name !== "Pending" ? [parent.name] : []),
          ...siblings.map((sibling) => sibling.name),
          ...children.map((child) => child.name),
        ],
        ...(parent && parent.name !== "Pending" ? { parentName: parent.name } : {}),
        ...(parent && parent.description.trim().length > 0 ? { parentDescription: parent.description } : {}),
      })
    } else {
      // No members, no named children — leave Pending so a later pass can
      // try again once children are named.
      return { name: cluster.name, description: cluster.description } satisfies NameTaxonomyResult
    }

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
  }).pipe(Effect.withSpan("taxonomy.nameCluster"))
