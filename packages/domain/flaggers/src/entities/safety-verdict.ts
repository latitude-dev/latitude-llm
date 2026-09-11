import { z } from "zod"
import { buildJudgmentVersion } from "./judgment-version.ts"

export const SAFETY_FINDING_KINDS = [
  "injectionAttempt",
  "injectionDefense",
  "injectionCompliance",
  "piiExposure",
  "piiDisclosure",
] as const

export const safetyFindingKindSchema = z.enum(SAFETY_FINDING_KINDS)
export type SafetyFindingKind = z.infer<typeof safetyFindingKindSchema>

/**
 * The judged sides of an injection attempt.
 *
 * Attempt and compliance are separate fields because the attack is the user's
 * behaviour and the compliance is the agent's: a refused attempt is exposure,
 * and only the agent following it is harm. `complianceAction` names what the
 * assistant actually did, which is the assistant-side evidence that makes a
 * compliance claim a confirmation rather than a category.
 */
interface InjectionVerdict {
  readonly attempted: boolean
  readonly complied: boolean
  readonly complianceAction: string | null
  readonly resisted: boolean
}

/** Personal data judged by authorship: what the user supplied is exposure, what the assistant surfaced can be harm. */
interface PiiVerdict {
  readonly assistantDisclosed: boolean
  readonly disclosedData: string | null
  readonly userAuthoredPresent: boolean
}

const named = (value: string | null): boolean => value !== null && value.trim().length > 0

/**
 * The single finding kind an injection judgement resolves to, most severe first.
 *
 * A compliance claim with no named assistant action falls through to the
 * attempt, and a defense claim with no confirmed attempt resolves to nothing:
 * both gates live here rather than in the prompt, because a constrained decoder
 * obeys the schema and not the prose.
 */
export const resolveInjectionFindingKind = (verdict: InjectionVerdict): SafetyFindingKind | null => {
  if (!verdict.attempted) return null
  if (verdict.complied && named(verdict.complianceAction)) return "injectionCompliance"
  if (verdict.resisted) return "injectionDefense"
  return "injectionAttempt"
}

export const resolvePiiFindingKind = (verdict: PiiVerdict): SafetyFindingKind | null => {
  if (verdict.assistantDisclosed && named(verdict.disclosedData)) return "piiDisclosure"
  if (verdict.userAuthoredPresent) return "piiExposure"
  return null
}

const ANNOTATED_SAFETY_FINDING_KINDS: ReadonlySet<SafetyFindingKind> = new Set([
  "injectionAttempt",
  "injectionCompliance",
  "piiDisclosure",
])

/**
 * Whether a finding kind writes a negative annotation, as its detector already
 * did before the structured contract.
 *
 * A refused injection is annotated today and is what the Jailbreaking signal
 * collects, so it keeps its annotation and only loses the harm claim. User-echoed
 * personal data is explicitly not flagged today, so recording it as exposure must
 * not turn every session whose user typed their own email into an annotation and
 * a signal. A successful defense is the agent behaving correctly and is never one.
 */
export const writesSafetyAnnotation = (kind: SafetyFindingKind): boolean => ANNOTATED_SAFETY_FINDING_KINDS.has(kind)

export const SAFETY_JUDGMENT_VERSION_PREFIX = "safety-v1"

export const safetyJudgmentVersion = (judge: { readonly provider: string; readonly model: string }): string =>
  buildJudgmentVersion(SAFETY_JUDGMENT_VERSION_PREFIX, judge)
