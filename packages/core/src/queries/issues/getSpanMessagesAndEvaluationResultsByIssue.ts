import { Commit } from '../../schema/models/types/Commit'
import { Workspace } from '../../schema/models/types/Workspace'
import {
  CommitsRepository,
  EvaluationResultsV2Repository,
} from '../../repositories'
import { Result } from '../../lib/Result'
import { EvaluationV2 } from '../../constants'
import { Issue } from '../../schema/models/types/Issue'
import { getHITLSpansByIssue } from './getHITLSpansByIssue'
import {
  buildSpanMessagesWithReasons,
  SpanMessagesWithReason,
  getReasonFromEvaluationResult,
} from '../../services/spans/buildSpanMessagesWithReasons'

export type SpanMessagesWithEvalResultReason = SpanMessagesWithReason
export { getReasonFromEvaluationResult }

export async function getSpanMessagesAndEvaluationResultsByIssue({
  workspace,
  commit,
  issue,
  existingEvaluations,
}: {
  workspace: Workspace
  commit: Commit
  issue: Issue
  existingEvaluations: EvaluationV2[]
}) {
  const spansResult = await getHITLSpansByIssue({
    workspace,
    commit,
    issue,
    pageSize: 3,
    page: 1,
    orderDirection: 'desc',
  })

  if (!Result.isOk(spansResult)) {
    return spansResult
  }

  const { spans } = spansResult.unwrap()

  const evaluationResultsRepository = new EvaluationResultsV2Repository(
    workspace.id,
  )
  const commitsRepo = new CommitsRepository(workspace.id)
  const commitHistory = await commitsRepo.getCommitsHistory({ commit })
  const commitHistoryIds = commitHistory.map((c) => c.id)

  const evaluationResults = await evaluationResultsRepository.listByIssueIds(
    [issue.id],
    commitHistoryIds,
  )

  return buildSpanMessagesWithReasons({
    workspace,
    spans,
    evaluationResults,
    evaluations: existingEvaluations,
  })
}
