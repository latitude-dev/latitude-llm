import { AI } from "@domain/ai"
import { generateId, type OrganizationId, type ProjectId, TraceId } from "@domain/shared"
import { SessionRepository, TraceRepository } from "@domain/spans"
import {
  CalibrationProfileRepository,
  type ConversationCalibration,
  conversationCalibrationSchema,
} from "@domain/taxonomy"
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

export interface CalibrateConversationThresholdsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly sampleSize?: number
  readonly now?: Date
}

export interface CalibrateConversationThresholdsResult {
  readonly calibration: ConversationCalibration
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
    if (candidates.length < 3) {
      return { threshold: Math.max(input.quantileGate.threshold, input.staticThreshold), judgedPrecision: null }
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
      // Judge unavailable: keep the conservative static gate.
      return { threshold: Math.max(input.quantileGate.threshold, input.staticThreshold), judgedPrecision: null }
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
    if (bestThreshold === null || truesSeen < 2) {
      // The judge inspected this kind's best-scoring candidates and could not
      // confirm a usable precision band — the anchor does not separate real
      // events on this corpus, and every lower score is worse. Disable the
      // kind for the project (gates re-open automatically once a future
      // calibration verifies a band, e.g. after anchor improvements).
      return { threshold: CONVERSATION_CALIBRATION_DISABLED_GATE, judgedPrecision }
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
export const calibrateConversationThresholdsUseCase = (input: CalibrateConversationThresholdsInput) =>
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
    const judgedPrecisions: Record<string, number> = {}
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
      labelAnchors[kind] = { threshold: refined.threshold, margin: quantileGate.margin }
      if (refined.judgedPrecision !== null) judgedPrecisions[`judgedPrecision_${kind}`] = refined.judgedPrecision
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

    const calibration = conversationCalibrationSchema.parse({
      labelAnchors,
      ritual,
      continuity,
    } satisfies ConversationCalibration)

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
      ...judgedPrecisions,
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

    return { calibration, sampleSize: sampled.length, metrics } satisfies CalibrateConversationThresholdsResult
  }).pipe(Effect.withSpan("conversationIntelligence.calibrateConversationThresholds"))
