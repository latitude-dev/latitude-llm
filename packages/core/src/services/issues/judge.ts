import { env } from '@latitude-data/env'
import { z } from 'zod'
import { Result } from '../../lib/Result'
import { Issue } from '../../schema/models/types/Issue'
import { runCopilot } from '../copilot'

const mergeJudgeSchema = z.object({
  decisions: z.array(
    z.object({
      candidateId: z.number(),
      shouldMerge: z.boolean(),
      reason: z.string(),
    }),
  ),
})

type MergeJudgeResult = z.infer<typeof mergeJudgeSchema>

/**
 * Uses an LLM judge to determine whether candidate issues should be merged with an anchor issue.
 * The judge reviews the title and description of each candidate against the anchor issue.
 *
 * **Important Notes:**
 * - This function uses an LLM and is non-deterministic - the same inputs may produce different results
 * - Graceful fallback: if COPILOT_PROMPT_ISSUE_MERGE_JUDGE_PATH is not set or copilot fails, all candidates pass through
 * - The judge is a best-effort filter to reduce false positives, not a guarantee of correctness
 * - Judge decisions (approved/rejected candidates with reasons) are logged for audit purposes
 *
 * @param anchor - The anchor issue to compare against
 * @param candidates - The candidate issues to evaluate for merging
 * @returns Array of candidates that should be merged according to the LLM judge
 */
export async function judgeMergeCandidates({
  anchor,
  candidates,
}: {
  anchor: Issue
  candidates: Issue[]
}): Promise<Issue[]> {
  if (!env.COPILOT_PROMPT_ISSUE_MERGE_JUDGE_PATH) {
    return candidates
  }

  if (candidates.length === 0) {
    return []
  }

  const parameters = {
    anchor: {
      id: anchor.id,
      title: anchor.title,
      description: anchor.description,
    },
    candidates: candidates.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
    })),
  }

  const response = await runCopilot({
    path: env.COPILOT_PROMPT_ISSUE_MERGE_JUDGE_PATH,
    parameters,
    schema: mergeJudgeSchema,
  })
  if (!Result.isOk(response)) {
    // Log failure for observability (graceful fallback to all candidates)
    console.warn(
      `[Issue Judge] LLM judge failed for anchor ${anchor.id}, passing through all ${candidates.length} candidates`,
      { error: response.error.message },
    )
    return candidates
  }

  const result: MergeJudgeResult = response.value

  // Validate that LLM returned decisions for all candidates
  const candidateIds = new Set(candidates.map((c) => c.id))
  const decidedIds = new Set(result.decisions.map((d) => d.candidateId))

  // Check for missing decisions (candidates without decisions are implicitly rejected)
  const missingDecisions = Array.from(candidateIds).filter(
    (id) => !decidedIds.has(id),
  )
  if (missingDecisions.length > 0) {
    console.warn(
      `[Issue Judge] LLM judge did not return decisions for ${missingDecisions.length}/${candidates.length} candidates (anchor: ${anchor.id}). Missing IDs: ${missingDecisions.join(', ')}`,
    )
  }

  // Check for extra decisions (decisions for candidate IDs that don't exist)
  const extraDecisions = result.decisions.filter(
    (d) => !candidateIds.has(d.candidateId),
  )
  if (extraDecisions.length > 0) {
    console.warn(
      `[Issue Judge] LLM judge returned decisions for ${extraDecisions.length} unknown candidate IDs (anchor: ${anchor.id}). Unknown IDs: ${extraDecisions.map((d) => d.candidateId).join(', ')}`,
    )
  }

  const approvedIds = new Set(
    result.decisions
      .filter((decision) => decision.shouldMerge)
      .map((decision) => decision.candidateId),
  )

  const approved = candidates.filter((candidate) =>
    approvedIds.has(candidate.id),
  )
  const rejected = candidates.length - approved.length

  // Log judge decisions for audit trail
  console.info(
    `[Issue Judge] Anchor ${anchor.id}: approved ${approved.length}/${candidates.length} candidates (rejected: ${rejected})`,
  )

  // Log detailed decisions for audit purposes
  result.decisions.forEach((decision) => {
    const action = decision.shouldMerge ? 'APPROVED' : 'REJECTED'
    console.info(
      `[Issue Judge] ${action} candidate ${decision.candidateId}: ${decision.reason}`,
    )
  })

  return approved
}
