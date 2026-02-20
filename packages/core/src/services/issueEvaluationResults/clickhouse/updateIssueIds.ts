import { clickhouseClient } from '../../../client/clickhouse'
import { Result, TypedResult } from '../../../lib/Result'
import { captureException } from '../../../utils/datadogCapture'

export async function addIssueIdToEvaluationResult({
  workspaceId,
  evaluationResultId,
  issueId,
}: {
  workspaceId: number
  evaluationResultId: number
  issueId: number
}): Promise<TypedResult<undefined>> {
  try {
    await clickhouseClient().query({
      query: `
        ALTER TABLE evaluation_results
        UPDATE issue_ids = arrayPushBack(issue_ids, {issueId: UInt64})
        WHERE id = {evaluationResultId: UInt64}
          AND workspace_id = {workspaceId: UInt64}
      `,
      query_params: { workspaceId, evaluationResultId, issueId },
    })
    return Result.ok(undefined)
  } catch (error) {
    captureException(error as Error)
    return Result.error(error as Error)
  }
}

export async function removeIssueIdFromEvaluationResult({
  workspaceId,
  evaluationResultId,
  issueId,
}: {
  workspaceId: number
  evaluationResultId: number
  issueId: number
}): Promise<TypedResult<undefined>> {
  try {
    await clickhouseClient().query({
      query: `
        ALTER TABLE evaluation_results
        UPDATE issue_ids = arrayFilter(x -> x != {issueId: UInt64}, issue_ids)
        WHERE id = {evaluationResultId: UInt64}
          AND workspace_id = {workspaceId: UInt64}
      `,
      query_params: { workspaceId, evaluationResultId, issueId },
    })
    return Result.ok(undefined)
  } catch (error) {
    captureException(error as Error)
    return Result.error(error as Error)
  }
}

export async function setIssueIdsForEvaluationResult({
  workspaceId,
  evaluationResultId,
  issueIds,
}: {
  workspaceId: number
  evaluationResultId: number
  issueIds: number[]
}): Promise<TypedResult<undefined>> {
  try {
    await clickhouseClient().query({
      query: `
        ALTER TABLE evaluation_results
        UPDATE issue_ids = {issueIds: Array(UInt64)}
        WHERE id = {evaluationResultId: UInt64}
          AND workspace_id = {workspaceId: UInt64}
      `,
      query_params: { workspaceId, evaluationResultId, issueIds },
    })
    return Result.ok(undefined)
  } catch (error) {
    captureException(error as Error)
    return Result.error(error as Error)
  }
}
