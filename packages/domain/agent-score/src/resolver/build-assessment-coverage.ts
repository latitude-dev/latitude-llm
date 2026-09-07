import {
  FLAGGER_DISPLAY,
  type FlaggerScreeningDecision,
  type FlaggerSlug,
  resolveFlaggerScreeningCoverage,
} from "@domain/flaggers"
import { SCORE_DIMENSIONS, type ScoreDimension } from "@domain/shared"
import type {
  SessionAssessmentCoverage,
  SessionReaderCoverage,
  SessionReaderSelection,
} from "../entities/session-assessment.ts"
import type { AssessmentReaderFact } from "../entities/session-assessment-input.ts"
import type { SessionDimensionCoverage } from "./build-dimension-summaries.ts"

const FLAGGER_DIMENSIONS = {
  "task-success": ["outcome"],
  "tool-call-errors": ["reliability", "cost", "speed"],
  "output-schema-validation": ["outcome", "reliability"],
  "empty-response": ["outcome", "reliability"],
  trashing: ["cost", "speed"],
  "low-cache-hit-rate": ["cost"],
  forgetting: ["outcome", "cost"],
  bluffing: ["outcome"],
  incompletion: ["outcome"],
  laziness: ["outcome", "speed"],
  refusal: ["outcome"],
  frustration: ["outcome"],
  "pii-leakage": ["safety"],
  jailbreaking: ["safety"],
  nsfw: ["safety"],
} as const satisfies Record<string, readonly ScoreDimension[]>

const coverageFromReaderFact = (fact: AssessmentReaderFact): SessionReaderCoverage => {
  const base = {
    readerId: fact.readerId,
    label: fact.label,
    scoreDimensions: [...fact.scoreDimensions],
  }
  if (!fact.applicable && fact.totalCount === 0) return { ...base, status: "notApplicable" }
  if (!fact.applicable || fact.readableCount === 0) {
    return { ...base, status: "notExamined", limitation: fact.limitation ?? "missingTelemetry" }
  }
  if (fact.readableCount < fact.totalCount) {
    return {
      ...base,
      status: "partiallyExamined",
      findingCount: fact.findingCount,
      readableCount: fact.readableCount,
      totalCount: fact.totalCount,
      limitation: fact.limitation ?? "missingTelemetry",
    }
  }
  return { ...base, status: "examined", findingCount: fact.findingCount }
}

const decisionSelection = (decision: FlaggerScreeningDecision): SessionReaderSelection | undefined => {
  if (decision.inclusionProbability === undefined || decision.reason === "skipped") return undefined
  if (decision.reason === "rate-limited") {
    return {
      method: decision.hintKinds.length > 0 ? "hinted" : "ordinary-sample",
      inclusionProbability: decision.inclusionProbability,
    }
  }
  return { method: decision.reason, inclusionProbability: decision.inclusionProbability }
}

const coverageFromDecision = (decision: FlaggerScreeningDecision): SessionReaderCoverage => {
  const slug = decision.flaggerSlug as FlaggerSlug
  const selection = decisionSelection(decision)
  const base = {
    readerId: `flagger:${decision.flaggerSlug}`,
    label: FLAGGER_DISPLAY[slug]?.name ?? decision.flaggerSlug,
    scoreDimensions: [...(FLAGGER_DIMENSIONS[decision.flaggerSlug] ?? [])],
  }
  if (decision.outcome === "notApplicable") return { ...base, status: "notApplicable" }
  const screening = resolveFlaggerScreeningCoverage(decision)
  if (screening.status === "notExamined") {
    return {
      ...base,
      status: "notExamined",
      limitation: screening.limitation,
      ...(selection ? { selection } : {}),
    }
  }
  return {
    ...base,
    status: "examined",
    findingCount:
      decision.outcome === "matched" || decision.outcome === "failure" || decision.outcome === "success" ? 1 : 0,
    ...(selection ? { selection } : {}),
  }
}

const dimensionCoverage = (
  readers: readonly SessionReaderCoverage[],
): Readonly<Record<ScoreDimension, SessionDimensionCoverage>> =>
  Object.fromEntries(
    SCORE_DIMENSIONS.map((dimension) => {
      const relevant = readers.filter((reader) => reader.scoreDimensions.includes(dimension))
      const applicable = relevant.filter((reader) => reader.status !== "notApplicable")
      if (applicable.length === 0) return [dimension, "notExamined"]
      const examined = applicable.filter((reader) => reader.status === "examined").length
      const partial = applicable.some((reader) => reader.status === "partiallyExamined")
      const missed = applicable.some((reader) => reader.status === "notExamined")
      if (!partial && !missed) return [dimension, "complete"]
      if (examined > 0 || partial) return [dimension, "partial"]
      return [dimension, "notExamined"]
    }),
  ) as Readonly<Record<ScoreDimension, SessionDimensionCoverage>>

export interface BuildSessionAssessmentCoverageInput {
  readonly readers: readonly AssessmentReaderFact[]
  readonly screeningDecisions: readonly FlaggerScreeningDecision[]
}

export interface ResolvedSessionAssessmentCoverage {
  readonly coverage: SessionAssessmentCoverage
  readonly dimensions: Readonly<Record<ScoreDimension, SessionDimensionCoverage>>
}

export const buildSessionAssessmentCoverage = ({
  readers,
  screeningDecisions,
}: BuildSessionAssessmentCoverageInput): ResolvedSessionAssessmentCoverage => {
  const resolvedReaders = [...readers.map(coverageFromReaderFact), ...screeningDecisions.map(coverageFromDecision)]
  return {
    coverage: { readers: resolvedReaders },
    dimensions: dimensionCoverage(resolvedReaders),
  }
}
