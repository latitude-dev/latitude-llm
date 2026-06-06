import { AI } from "@domain/ai"
import { generateId, type OrganizationId, type ProjectId, TraceId } from "@domain/shared"
import { SessionRepository, TraceRepository } from "@domain/spans"
import { CalibrationProfileRepository, type SessionCalibration, sessionCalibrationSchema } from "@domain/taxonomy"
import { Effect } from "effect"
import { z } from "zod"
import { embedAnchorText, MOMENT_LABEL_ANCHORS, RITUAL_CONTRAST_ANCHORS, RITUAL_POSITIVE_ANCHORS } from "../anchors.ts"
import {
  CONVERSATION_CALIBRATION_CONTINUITY_MAX_CEIL,
  CONVERSATION_CALIBRATION_CONTINUITY_MIN_FLOOR,
  CONVERSATION_CALIBRATION_DISABLED_GATE,
  CONVERSATION_CALIBRATION_JUDGE_SAMPLE,
  CONVERSATION_CALIBRATION_LABEL_MARGIN_MAX,
  CONVERSATION_CALIBRATION_LABEL_MARGIN_MIN,
  CONVERSATION_CALIBRATION_LABEL_MIN_ACCEPTED,
  CONVERSATION_CALIBRATION_LABEL_MIN_JUDGED,
  CONVERSATION_CALIBRATION_LABEL_QUANTILE,
  CONVERSATION_CALIBRATION_LABEL_THRESHOLD_MAX,
  CONVERSATION_CALIBRATION_LABEL_THRESHOLD_MIN,
  CONVERSATION_CALIBRATION_PRECISION_TARGET,
  CONVERSATION_CALIBRATION_RITUAL_QUANTILE,
  CONVERSATION_CALIBRATION_SESSION_SAMPLE,
  CONVERSATION_INTELLIGENCE_EMBEDDING_DIMENSIONS,
  CONVERSATION_INTELLIGENCE_EMBEDDING_MODEL,
  CONVERSATION_INTELLIGENCE_MODEL,
  CONVERSATION_INTELLIGENCE_MODEL_PROVIDER,
} from "../constants.ts"
import { normalizeMessages } from "../normalization.ts"
import { cosineSimilarity, type SemanticSegmentationTurn } from "../semantic-segmentation.ts"

export interface CalibrateSessionThresholdsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly sampleSize?: number
  readonly now?: Date
}

export interface CalibrateSessionThresholdsResult {
  readonly calibration: SessionCalibration
  readonly sampleSize: number
  readonly metrics: Readonly<Record<string, number>>
}

const clampValue = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const quantile = (sorted: readonly number[], q: number): number =>
  sorted.length === 0 ? 0 : (sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0)

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  return quantile(sorted, 0.5)
}

interface AnchorSample {
  readonly sessionId: string
  readonly positive: number
  readonly margin: number
  readonly text: string
}

const OUTCOME_KINDS: readonly string[] = ["resolution", "escalation", "abandonment"]

const judgeVerdictsSchema = z.object({ verdicts: z.array(z.boolean()) })

const LABEL_CALIBRATION_DECISION_CODES = {
  calibrated: 1,
  defaultLowSupport: 2,
  disabledLowPrecision: 3,
} as const

/**
 * Quantile gates fix the fire *rate*, not precision — a p95 threshold on a
 * rare event mass-fires on near-anchor lookalikes (QA: a calibrated 0.567
 * escalation gate fired on "Hi! How can I help you today?"). The judge labels
 * the top-scoring candidate turns once per calibration and the gate moves to
 * the lowest score that keeps judged precision above the target. Falls back
 * to the detector's static threshold when the judge can't confirm enough
 * positives.
 */
const refineGateWithJudge = (input: {
  readonly kind: string
  readonly rubric: string
  readonly samples: readonly AnchorSample[]
  readonly quantileGate: { readonly threshold: number; readonly margin: number }
  readonly staticThreshold: number
}) =>
  Effect.gen(function* () {
    const ai = yield* AI
    const candidates = [...input.samples]
      .filter((sample) => sample.margin >= input.quantileGate.margin)
      .sort((a, b) => b.positive - a.positive)
      .slice(0, CONVERSATION_CALIBRATION_JUDGE_SAMPLE)
    if (candidates.length < CONVERSATION_CALIBRATION_LABEL_MIN_JUDGED) {
      return {
        threshold: input.staticThreshold,
        judgedPrecision: null,
        judgedCount: candidates.length,
        acceptedCount: 0,
        decisionCode: LABEL_CALIBRATION_DECISION_CODES.defaultLowSupport,
      }
    }
    const verdicts = yield* ai
      .generate({
        provider: CONVERSATION_INTELLIGENCE_MODEL_PROVIDER,
        model: CONVERSATION_INTELLIGENCE_MODEL,
        system: `calibrationJudge: for each numbered conversation turn, decide whether it genuinely expresses: ${input.rubric}. Greetings, routine task progress, and polite boilerplate are false. Return only schema-valid JSON with exactly one boolean per turn.`,
        prompt: `${candidates.map((candidate, index) => `${index}: ${candidate.text}`).join("\n\n")}\n\nReturn JSON exactly like {"verdicts":[true,false,...]} with ${candidates.length} entries.`,
        schema: judgeVerdictsSchema,
        temperature: 0,
        maxTokens: 2_000,
      })
      .pipe(Effect.orElseSucceed(() => null))
    if (verdicts === null || verdicts.object.verdicts.length !== candidates.length) {
      // Judge unavailable: keep the stable static gate instead of disabling a
      // possibly rare signal based on missing calibration evidence.
      return {
        threshold: input.staticThreshold,
        judgedPrecision: null,
        judgedCount: candidates.length,
        acceptedCount: 0,
        decisionCode: LABEL_CALIBRATION_DECISION_CODES.defaultLowSupport,
      }
    }
    // Walk down by score; the gate lands on the lowest score where cumulative
    // judged precision stays above the target.
    let truesSeen = 0
    let bestThreshold: number | null = null
    for (let index = 0; index < candidates.length; index++) {
      if (verdicts.object.verdicts[index]) truesSeen++
      const precision = truesSeen / (index + 1)
      const candidate = candidates[index]
      if (candidate && precision >= CONVERSATION_CALIBRATION_PRECISION_TARGET && verdicts.object.verdicts[index]) {
        bestThreshold = candidate.positive
      }
    }
    const judgedPrecision = truesSeen / candidates.length
    if (truesSeen < CONVERSATION_CALIBRATION_LABEL_MIN_ACCEPTED) {
      // Rare labels can have too few true positives in the calibration sample
      // to estimate precision. Keep the stable static gate; do not disable a
      // label just because the random sample had low support.
      return {
        threshold: input.staticThreshold,
        judgedPrecision,
        judgedCount: candidates.length,
        acceptedCount: truesSeen,
        decisionCode: LABEL_CALIBRATION_DECISION_CODES.defaultLowSupport,
      }
    }
    if (bestThreshold === null) {
      // Enough true positives exist, but no score band reaches the precision
      // target. That is real evidence that this anchor is unsafe here.
      return {
        threshold: CONVERSATION_CALIBRATION_DISABLED_GATE,
        judgedPrecision,
        judgedCount: candidates.length,
        acceptedCount: truesSeen,
        decisionCode: LABEL_CALIBRATION_DECISION_CODES.disabledLowPrecision,
      }
    }
    // Keep judge-refined gates inside the calibrated band the rest of the
    // pipeline assumes; a raw candidate cosine can land outside it.
    return {
      threshold: clampValue(
        bestThreshold,
        CONVERSATION_CALIBRATION_LABEL_THRESHOLD_MIN,
        CONVERSATION_CALIBRATION_LABEL_THRESHOLD_MAX,
      ),
      judgedPrecision,
      judgedCount: candidates.length,
      acceptedCount: truesSeen,
      decisionCode: LABEL_CALIBRATION_DECISION_CODES.calibrated,
    }
  })

const deriveAnchorGate = (input: {
  readonly samples: readonly AnchorSample[]
  readonly thresholdQuantile: number
}): { readonly threshold: number; readonly margin: number } => {
  const positives = input.samples.map((sample) => sample.positive).sort((a, b) => a - b)
  const threshold = clampValue(
    quantile(positives, input.thresholdQuantile),
    CONVERSATION_CALIBRATION_LABEL_THRESHOLD_MIN,
    CONVERSATION_CALIBRATION_LABEL_THRESHOLD_MAX,
  )
  const marginsAboveGate = input.samples.filter((sample) => sample.positive >= threshold).map((sample) => sample.margin)
  const margin = clampValue(
    marginsAboveGate.length === 0 ? CONVERSATION_CALIBRATION_LABEL_MARGIN_MIN : median(marginsAboveGate),
    CONVERSATION_CALIBRATION_LABEL_MARGIN_MIN,
    CONVERSATION_CALIBRATION_LABEL_MARGIN_MAX,
  )
  return { threshold, margin }
}

/**
 * Derives the conversation-scope thresholds (label anchor gates, ritual gate,
 * segmentation continuity clamps) from the project's own score
 * distributions. Turn embeddings are Redis-cached from regular analysis, so
 * a calibration pass costs almost nothing beyond reads.
 */
export const calibrateSessionThresholdsUseCase = (input: CalibrateSessionThresholdsInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("conversationIntelligence.projectId", input.projectId)
    const now = input.now ?? new Date()
    const sampleSize = input.sampleSize ?? CONVERSATION_CALIBRATION_SESSION_SAMPLE
    const sessions = yield* SessionRepository
    const traces = yield* TraceRepository
    const ai = yield* AI
    const profiles = yield* CalibrationProfileRepository

    const page = yield* sessions.listByProjectId({
      organizationId: input.organizationId,
      projectId: input.projectId,
      options: { limit: sampleSize, sortBy: "lastActivity", sortDirection: "desc" },
    })
    const sampled = page.items.filter((session) => session.traceIds.length > 0)

    const anchors = yield* Effect.forEach(MOMENT_LABEL_ANCHORS, (config) =>
      Effect.gen(function* () {
        const positive = yield* Effect.forEach(config.positiveAnchors, embedAnchorText)
        const contrast = yield* Effect.forEach(config.contrastAnchors, embedAnchorText)
        return { config, positive, contrast }
      }),
    )
    const ritualPositive = yield* Effect.forEach(RITUAL_POSITIVE_ANCHORS, embedAnchorText)
    const ritualContrast = yield* Effect.forEach(RITUAL_CONTRAST_ANCHORS, embedAnchorText)

    const labelSamples = new Map<string, AnchorSample[]>()
    const ritualSamples: AnchorSample[] = []
    const adjacentSimilarities: number[] = []

    yield* Effect.forEach(
      sampled,
      (session) =>
        Effect.gen(function* () {
          const traceIds = session.traceIds.filter((traceId) => traceId.length === 32).map(TraceId)
          const details = yield* traces.listByTraceIds({
            organizationId: input.organizationId,
            projectId: input.projectId,
            traceIds,
          })
          const rawMessages = [...details]
            .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
            .flatMap((trace) => trace.allMessages)
          const normalized = normalizeMessages(rawMessages).filter(
            (message) => message.role === "user" || message.role === "assistant",
          )
          const turns: SemanticSegmentationTurn[] = yield* Effect.forEach(
            normalized,
            (message) =>
              ai
                .embed({
                  text: `${message.role}: ${message.text}`,
                  model: CONVERSATION_INTELLIGENCE_EMBEDDING_MODEL,
                  dimensions: CONVERSATION_INTELLIGENCE_EMBEDDING_DIMENSIONS,
                  inputType: "document",
                })
                .pipe(
                  Effect.map((result) => ({
                    index: message.index,
                    role: message.role,
                    content: message.text,
                    embedding: result.embedding,
                  })),
                ),
            { concurrency: 8 },
          )

          for (let index = 1; index < turns.length; index++) {
            adjacentSimilarities.push(
              cosineSimilarity(turns[index - 1]?.embedding ?? [], turns[index]?.embedding ?? []),
            )
          }

          for (const { config, positive, contrast } of anchors) {
            for (const turn of turns) {
              if (!config.roles.includes(turn.role)) continue
              const positiveScore = Math.max(...positive.map((anchor) => cosineSimilarity(turn.embedding, anchor)), 0)
              const contrastScore = Math.max(...contrast.map((anchor) => cosineSimilarity(turn.embedding, anchor)), 0)
              const samples = labelSamples.get(config.kind) ?? []
              samples.push({
                sessionId: session.sessionId,
                positive: positiveScore,
                margin: positiveScore - contrastScore,
                text: `${turn.role}: ${turn.content.slice(0, 280)}`,
              })
              labelSamples.set(config.kind, samples)
            }
          }
          for (const turn of turns) {
            const positiveScore = Math.max(
              ...ritualPositive.map((anchor) => cosineSimilarity(turn.embedding, anchor)),
              0,
            )
            const contrastScore = Math.max(
              ...ritualContrast.map((anchor) => cosineSimilarity(turn.embedding, anchor)),
              0,
            )
            ritualSamples.push({
              sessionId: session.sessionId,
              positive: positiveScore,
              margin: positiveScore - contrastScore,
              text: `${turn.role}: ${turn.content.slice(0, 280)}`,
            })
          }
        }),
      { concurrency: 4 },
    )

    const labelAnchors: Record<string, { threshold: number; margin: number }> = {}
    const labelCalibrationMetrics: Record<string, number> = {}
    for (const [kind, samples] of labelSamples) {
      const quantileGate = deriveAnchorGate({ samples, thresholdQuantile: CONVERSATION_CALIBRATION_LABEL_QUANTILE })
      const config = MOMENT_LABEL_ANCHORS.find((anchor) => anchor.kind === kind)
      const refined = yield* refineGateWithJudge({
        kind,
        rubric: config?.positiveAnchors.join("; ") ?? kind,
        samples,
        quantileGate,
        staticThreshold: config?.threshold ?? quantileGate.threshold,
      })
      labelAnchors[kind] = {
        threshold: refined.threshold,
        margin:
          refined.decisionCode === LABEL_CALIBRATION_DECISION_CODES.defaultLowSupport
            ? (config?.margin ?? quantileGate.margin)
            : quantileGate.margin,
      }
      if (refined.judgedPrecision !== null) {
        labelCalibrationMetrics[`judgedPrecision_${kind}`] = refined.judgedPrecision
      }
      labelCalibrationMetrics[`judgedCount_${kind}`] = refined.judgedCount
      labelCalibrationMetrics[`judgedAccepted_${kind}`] = refined.acceptedCount
      labelCalibrationMetrics[`labelDecision_${kind}`] = refined.decisionCode
    }
    const ritual = deriveAnchorGate({
      samples: ritualSamples,
      thresholdQuantile: CONVERSATION_CALIBRATION_RITUAL_QUANTILE,
    })

    const sortedAdjacent = [...adjacentSimilarities].sort((a, b) => a - b)
    // Corpus-level continuity threshold via the same median - 1.5*MAD rule the
    // per-session gate uses; the clamp band is +-0.1 around it so per-session
    // adaptation stays anchored to the corpus. (Raw quantiles over-split:
    // p50 of adjacent-turn similarity is ~0.75 on dense support corpora, and
    // a 0.75 default boundary would split half of all turn transitions.)
    const corpusMedian = quantile(sortedAdjacent, 0.5)
    const corpusMad = median(sortedAdjacent.map((similarity) => Math.abs(similarity - corpusMedian)))
    const corpusThreshold = clampValue(
      corpusMedian - 1.5 * corpusMad,
      CONVERSATION_CALIBRATION_CONTINUITY_MIN_FLOOR,
      CONVERSATION_CALIBRATION_CONTINUITY_MAX_CEIL,
    )
    const continuity = {
      min: clampValue(
        corpusThreshold - 0.1,
        CONVERSATION_CALIBRATION_CONTINUITY_MIN_FLOOR,
        CONVERSATION_CALIBRATION_CONTINUITY_MAX_CEIL,
      ),
      default: corpusThreshold,
      max: clampValue(
        corpusThreshold + 0.1,
        CONVERSATION_CALIBRATION_CONTINUITY_MIN_FLOOR,
        CONVERSATION_CALIBRATION_CONTINUITY_MAX_CEIL,
      ),
    }

    const calibration = sessionCalibrationSchema.parse({
      labelAnchors,
      ritual,
      continuity,
    } satisfies SessionCalibration)

    // Simulated outcome coverage at the derived gates — the loss-function
    // metric the thresholds are tuned against.
    const covered = new Set<string>()
    for (const kind of OUTCOME_KINDS) {
      const gate = labelAnchors[kind]
      if (!gate) continue
      for (const sample of labelSamples.get(kind) ?? []) {
        if (sample.positive >= gate.threshold && sample.margin >= gate.margin) covered.add(sample.sessionId)
      }
    }
    const metrics: Record<string, number> = {
      outcomeCoverage: sampled.length === 0 ? 0 : covered.size / sampled.length,
      adjacentSimilarityMedian: quantile(sortedAdjacent, 0.5),
      ...labelCalibrationMetrics,
    }

    yield* profiles.save({
      id: generateId(),
      organizationId: input.organizationId,
      projectId: input.projectId,
      scope: "conversation",
      payload: calibration,
      metrics,
      sampleSize: sampled.length,
      computedAt: now,
      createdAt: now,
      updatedAt: now,
    })

    return { calibration, sampleSize: sampled.length, metrics } satisfies CalibrateSessionThresholdsResult
  }).pipe(Effect.withSpan("conversationIntelligence.calibrateSessionThresholds"))
