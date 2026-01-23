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
  if (!Result.isOk(response)) return candidates

  const result: MergeJudgeResult = response.value
  const approvedIds = new Set(
    result.decisions
      .filter((decision) => decision.shouldMerge)
      .map((decision) => decision.candidateId),
  )

  return candidates.filter((candidate) => approvedIds.has(candidate.id))
}
