import { AI } from "@domain/ai"
import { generateId, type OrganizationId, type ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import {
  TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD,
  TAXONOMY_ASSIGN_RELATIVE_MARGIN,
  TAXONOMY_BIRTH_LINK_THRESHOLD,
  TAXONOMY_BIRTH_MAX_DIAMETER,
  TAXONOMY_CALIBRATION_ASSIGN_MAX,
  TAXONOMY_CALIBRATION_ASSIGN_MIN,
  TAXONOMY_CALIBRATION_ASSIGN_QUANTILE,
  TAXONOMY_CALIBRATION_BIRTH_LINK_MAX,
  TAXONOMY_CALIBRATION_BIRTH_LINK_MIN,
  TAXONOMY_CALIBRATION_BIRTH_LINK_QUANTILE,
  TAXONOMY_CALIBRATION_DIAMETER_FACTOR,
  TAXONOMY_CALIBRATION_DIAMETER_MAX,
  TAXONOMY_CALIBRATION_DIAMETER_MIN,
  TAXONOMY_CALIBRATION_EMBEDDING_SAMPLE,
  TAXONOMY_CALIBRATION_PURITY_CLUSTERS,
  TAXONOMY_CALIBRATION_PURITY_MEMBERS,
  TAXONOMY_CALIBRATION_ROOT_LINK_MAX,
  TAXONOMY_CALIBRATION_ROOT_LINK_MIN,
  TAXONOMY_CALIBRATION_ROOT_LINK_QUANTILE,
  TAXONOMY_CALIBRATION_SCORE_SAMPLE,
  TAXONOMY_JUDGE_MODEL,
  TAXONOMY_NAMING_TIMEOUT_MS,
  TAXONOMY_TREE_ROOT_LINK_THRESHOLD,
} from "../constants.ts"
import { type ClusteringCalibration, clusteringCalibrationSchema } from "../entities/calibration.ts"
import { TaxonomyDimension, type TaxonomyDimension as TaxonomyDimensionType } from "../entities/dimension.ts"
import { clamp, cosineSimilarityNormalized, normalizeTaxonomyEmbedding, quantileSorted } from "../helpers.ts"
import { CalibrationProfileRepository } from "../ports/calibration-profile-repository.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { TaxonomyObservationRepository } from "../ports/taxonomy-observation-repository.ts"

export interface CalibrateClusteringThresholdsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly dimension?: TaxonomyDimensionType
  readonly now?: Date
}

export interface CalibrateClusteringThresholdsResult {
  readonly calibration: ClusteringCalibration
  readonly sampleSize: number
  readonly metrics: Readonly<Record<string, number>>
}

const purityVerdictSchema = z.object({ coherentMembers: z.number().int().nonnegative() })

const observationSummary = (metadata: Readonly<Record<string, unknown>>): string | null => {
  const summary = metadata.summary
  if (typeof summary !== "string") return null
  const trimmed = summary.trim()
  return trimmed.length === 0 ? null : trimmed.slice(0, 400)
}

/**
 * Judge-audited cluster purity: for a few clusters, sample member summaries
 * and ask the model how many belong to the cluster's named topic. Stored as a
 * quality metric on the profile; not yet used to auto-tune.
 */
const auditClusterPurity = (input: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly dimension: TaxonomyDimensionType
}) =>
  Effect.gen(function* () {
    const clusters = yield* TaxonomyClusterRepository
    const observations = yield* TaxonomyObservationRepository
    const ai = yield* AI
    const active = yield* clusters.listActiveByProject({ projectId: input.projectId, dimension: input.dimension })
    const audited = [...active]
      .sort((a, b) => b.observationCount - a.observationCount)
      .slice(0, TAXONOMY_CALIBRATION_PURITY_CLUSTERS)
    let judged = 0
    let coherent = 0
    for (const cluster of audited) {
      const members = yield* observations.listByCluster({
        organizationId: input.organizationId,
        projectId: input.projectId,
        dimension: input.dimension,
        clusterId: cluster.id,
        limit: TAXONOMY_CALIBRATION_PURITY_MEMBERS,
      })
      const summaries = members
        .map((member) => observationSummary(member.projectionMetadata))
        .filter((summary): summary is string => summary !== null)
      if (summaries.length < 2) continue
      const verdict = yield* ai
        .generate({
          provider: TAXONOMY_JUDGE_MODEL.provider,
          model: TAXONOMY_JUDGE_MODEL.model,
          system:
            "purityAudit: given a topic cluster's name and sampled member conversations, count how many members genuinely belong to that topic. Return only schema-valid JSON.",
          prompt: `Topic: ${cluster.name}\n${cluster.description}\n\nMembers:\n${summaries.map((summary, index) => `${index}: ${summary}`).join("\n")}\n\nReturn JSON exactly like {"coherentMembers":N} where N is how many of the ${summaries.length} members belong to the topic.`,
          schema: purityVerdictSchema,
          temperature: 0,
          maxTokens: 1_000,
        })
        .pipe(
          Effect.timeoutOrElse({
            duration: TAXONOMY_NAMING_TIMEOUT_MS,
            orElse: () => Effect.fail(new Error("Taxonomy purity audit timed out")),
          }),
          Effect.orElseSucceed(() => null),
        )
      if (verdict === null) continue
      judged += summaries.length
      coherent += Math.min(summaries.length, verdict.object.coherentMembers)
    }
    return judged === 0 ? null : coherent / judged
  })

export const calibrateClusteringThresholdsUseCase = (input: CalibrateClusteringThresholdsInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    const now = input.now ?? new Date()
    const dimension = input.dimension ?? TaxonomyDimension.Topic
    const observations = yield* TaxonomyObservationRepository
    const profiles = yield* CalibrationProfileRepository

    const embeddings = yield* observations.sampleEmbeddings({
      organizationId: input.organizationId,
      projectId: input.projectId,
      dimension,
      limit: TAXONOMY_CALIBRATION_EMBEDDING_SAMPLE,
    })
    const scores = yield* observations.sampleAssignmentScores({
      organizationId: input.organizationId,
      projectId: input.projectId,
      dimension,
      limit: TAXONOMY_CALIBRATION_SCORE_SAMPLE,
    })

    // Pairwise similarity distribution over a bounded sample: most pairs are
    // cross-topic, so the upper tail is where same-topic pairs live.
    const normalized = embeddings.map((embedding) => normalizeTaxonomyEmbedding(embedding))
    const pairLimit = Math.min(normalized.length, 250)
    const pairSimilarities: number[] = []
    for (let i = 0; i < pairLimit; i++) {
      for (let j = i + 1; j < pairLimit; j++) {
        const left = normalized[i]
        const right = normalized[j]
        if (left && right) pairSimilarities.push(cosineSimilarityNormalized(left, right))
      }
    }
    pairSimilarities.sort((a, b) => a - b)

    const assignedConfidences = scores
      .filter((score) => score.assigned && score.confidence > 0)
      .map((score) => score.confidence)
      .sort((a, b) => a - b)

    const birthLinkThreshold =
      pairSimilarities.length < 100
        ? TAXONOMY_BIRTH_LINK_THRESHOLD
        : clamp(
            quantileSorted(pairSimilarities, TAXONOMY_CALIBRATION_BIRTH_LINK_QUANTILE),
            TAXONOMY_CALIBRATION_BIRTH_LINK_MIN,
            TAXONOMY_CALIBRATION_BIRTH_LINK_MAX,
          )
    const birthMaxDiameter =
      pairSimilarities.length < 100
        ? TAXONOMY_BIRTH_MAX_DIAMETER
        : clamp(
            (1 - birthLinkThreshold) * TAXONOMY_CALIBRATION_DIAMETER_FACTOR,
            TAXONOMY_CALIBRATION_DIAMETER_MIN,
            TAXONOMY_CALIBRATION_DIAMETER_MAX,
          )
    const assignAbsoluteThreshold =
      assignedConfidences.length < 50
        ? TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD
        : clamp(
            quantileSorted(assignedConfidences, TAXONOMY_CALIBRATION_ASSIGN_QUANTILE),
            TAXONOMY_CALIBRATION_ASSIGN_MIN,
            TAXONOMY_CALIBRATION_ASSIGN_MAX,
          )

    const rootLinkThreshold =
      pairSimilarities.length < 100
        ? TAXONOMY_TREE_ROOT_LINK_THRESHOLD
        : clamp(
            quantileSorted(pairSimilarities, TAXONOMY_CALIBRATION_ROOT_LINK_QUANTILE),
            TAXONOMY_CALIBRATION_ROOT_LINK_MIN,
            TAXONOMY_CALIBRATION_ROOT_LINK_MAX,
          )
    const calibration = clusteringCalibrationSchema.parse({
      birthLinkThreshold,
      rootLinkThreshold,
      birthMaxDiameter,
      assignAbsoluteThreshold,
      // Runner-up scores are not persisted, so the relative gate stays on the
      // global constant until assignment telemetry stores them.
      assignRelativeMargin: TAXONOMY_ASSIGN_RELATIVE_MARGIN,
    } satisfies ClusteringCalibration)

    const noise = scores.filter((score) => !score.assigned).length
    const purity = yield* auditClusterPurity({
      organizationId: input.organizationId,
      projectId: input.projectId,
      dimension,
    })
    const metrics: Record<string, number> = {
      noiseShare: scores.length === 0 ? 0 : noise / scores.length,
      pairSampleSize: pairSimilarities.length,
      ...(purity === null ? {} : { clusterPurity: purity }),
    }

    yield* profiles.save({
      id: generateId(),
      organizationId: input.organizationId,
      projectId: input.projectId,
      scope: "clustering",
      payload: calibration,
      metrics,
      sampleSize: embeddings.length,
      computedAt: now,
      createdAt: now,
      updatedAt: now,
    })

    return { calibration, sampleSize: embeddings.length, metrics } satisfies CalibrateClusteringThresholdsResult
  }).pipe(Effect.withSpan("taxonomy.calibrateClusteringThresholds"))
