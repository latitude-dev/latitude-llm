import type { FlaggerScreeningDecision } from "@domain/flaggers"
import type { ScoreSourceType } from "@domain/scores"
import type { ScoreEvidenceContract, SessionId, SignalOrigin } from "@domain/shared"
import type {
  SessionAssessmentSource,
  SessionEvidenceAnchor,
  SessionEvidenceDestination,
} from "./session-assessment.ts"

export interface AssessmentFindingChronology {
  readonly occurredAt?: Date
  readonly messageIndex?: number
}

export interface AssessmentFindingReference {
  readonly evidenceKey: string
  readonly label: string
  readonly description?: string
  readonly source: SessionAssessmentSource
  readonly metricId?: string
  readonly signalIds: readonly string[]
  readonly scoreIds: readonly string[]
  readonly occurrenceCount: number
  readonly chronology: AssessmentFindingChronology
  readonly anchors: readonly SessionEvidenceAnchor[]
  readonly destinations: readonly SessionEvidenceDestination[]
  readonly independentHumanEvidence: boolean
}

export type AssessmentFinding = AssessmentFindingReference &
  (
    | { readonly kind: "usableCompletion" }
    | {
        readonly kind: "noOutput"
        readonly findingKind: "blank" | "confirmedUnusablePattern" | "unconfirmedPattern"
      }
    | {
        readonly kind: "outputDamage"
        readonly findingKind: "trailingComma" | "unclosedString" | "invalidJson"
        readonly generationPosition: "final" | "intermediate"
      }
    | {
        readonly kind: "toolFailure"
        readonly recovered: boolean
        readonly sameSubjectRecovered?: boolean
        readonly terminal: boolean
      }
    | {
        readonly kind: "toolStructuralDefect"
        readonly findingKind: "malformed" | "duplicate" | "undeclared" | "unknown-id"
        readonly terminal: boolean
      }
    | { readonly kind: "toolRepetition"; readonly redundancy: "unconfirmed" }
    | { readonly kind: "cacheGap" }
    | {
        readonly kind: "finishFailure"
        readonly findingKind: "length" | "contentFilter" | "guardrail" | "malformedFunctionCall" | "generationError"
        readonly generationPosition: "final" | "intermediate"
        readonly observedMicrocents: number
        readonly observedNs: number
      }
    | {
        readonly kind: "providerError"
        readonly findingKind: "rateLimit" | "overload" | "serviceFailure" | "providerRejection"
        readonly recovered: boolean
        readonly sameSubjectRecovered: boolean
        readonly terminal: boolean
        readonly observedMicrocents: number
        readonly observedNs: number
      }
    | { readonly kind: "taskOutcome"; readonly verdict: "success" | "failure" }
    | {
        readonly kind: "classifiedJudgment"
        readonly roles: readonly ScoreEvidenceContract[]
        readonly negative: boolean
        readonly judgmentKind: ScoreSourceType
        readonly signalOrigin?: SignalOrigin
        readonly findingKind?: string
      }
    | {
        readonly kind: "standaloneScore"
        readonly negative: boolean
        readonly judgmentKind: ScoreSourceType
        readonly signalOrigin?: SignalOrigin
      }
    | {
        readonly kind: "moment"
        readonly momentKinds: readonly string[]
      }
  )

export interface AssessmentReaderFact {
  readonly readerId: string
  readonly label: string
  readonly scoreDimensions: readonly ScoreEvidenceContract["scoreDimension"][]
  readonly applicable: boolean
  readonly findingCount: number
  readonly readableCount: number
  readonly totalCount: number
  readonly limitation?: "missingTelemetry" | "unmappedTelemetry" | "missingPricing" | "criticalPathUnavailable"
}

export interface NormalizedSessionAssessmentInput {
  readonly sessionId: SessionId
  readonly observedMicrocents: number
  readonly observedDurationNs: number
  readonly findings: readonly AssessmentFinding[]
  readonly readers: readonly AssessmentReaderFact[]
  readonly screeningDecisions: readonly FlaggerScreeningDecision[]
}
