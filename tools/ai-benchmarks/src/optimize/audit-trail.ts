import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { OptimizationStopReason } from "@domain/optimizations"

/**
 * Per-iteration record: which candidate became which, why (proposer
 * reasoning), what it cost, and whether the static-scan rejected it before
 * it ever reached evaluate. This is the row-shaped log that backs both
 * the live iteration table and the audit JSON written at the end of a run.
 */
export interface IterationRecord {
  readonly iteration: number
  readonly parentHash: string
  readonly childHash: string
  readonly proposerReasoning: string | null
  readonly proposerCostUsd: number | null
  readonly proposerAttempts: number
  readonly changedDeclarations: readonly string[]
  readonly rejection: { readonly stage: string; readonly reason: string } | null
  readonly timestampMs: number
}

export interface CandidateScore {
  readonly exampleId: string
  readonly score: 0 | 1
  readonly phase: string
}

/**
 * Per-candidate record: full file text + every per-row score it got. The
 * file text lives here rather than on the iteration record because GEPA may
 * evaluate the same candidate multiple times across iterations; we want one
 * source of truth keyed by hash.
 */
export interface CandidateRecord {
  readonly hash: string
  readonly text: string
  readonly scores: CandidateScore[]
}

interface AuditTrail {
  readonly iterations: IterationRecord[]
  readonly candidates: Map<string, CandidateRecord>
}

export const createAuditTrail = (): AuditTrail => ({
  iterations: [],
  candidates: new Map(),
})

export const recordCandidate = (
  trail: AuditTrail,
  candidate: { readonly hash: string; readonly text: string },
): CandidateRecord => {
  const existing = trail.candidates.get(candidate.hash)
  if (existing) return existing
  const record: CandidateRecord = { hash: candidate.hash, text: candidate.text, scores: [] }
  trail.candidates.set(candidate.hash, record)
  return record
}

export const recordScore = (
  trail: AuditTrail,
  candidate: { readonly hash: string; readonly text: string },
  score: CandidateScore,
): void => {
  recordCandidate(trail, candidate).scores.push(score)
}

export const recordIteration = (trail: AuditTrail, record: IterationRecord): void => {
  trail.iterations.push(record)
}

export interface SerializedAuditTrail {
  readonly version: 1
  readonly targetId: string
  readonly startedAt: string
  readonly finishedAt: string
  readonly baselineHash: string
  readonly winnerHash: string
  readonly budget: {
    readonly time?: number
    readonly tokens?: number
    readonly stagnation?: number
  } | null
  readonly stopReason: OptimizationStopReason | null
  /**
   * Total main-loop iterations the optimizer engine actually entered.
   * For GEPA this includes iterations skipped before any propose call
   * (`skip_perfect_score` path, merge-only iterations). Null when the
   * engine did not report it (older crashes, etc.).
   */
  readonly engineTotalIterations: number | null
  /**
   * Number of accepted candidates produced from a propose call. Together
   * with `engineTotalIterations` this lets reviewers see how many
   * iterations were silently skipped by the engine.
   */
  readonly engineProposeCalls: number | null
  readonly sampleSize: number | null
  readonly seed: number
  readonly operatorNotes: string | null
  readonly iterations: readonly IterationRecord[]
  readonly candidates: readonly CandidateRecord[]
}

export async function writeAuditTrail(path: string, payload: SerializedAuditTrail): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`)
}
