import { Commit } from '../../schema/models/types/Commit'
import { Workspace } from '../../schema/models/types/Workspace'
import { Result } from '../../lib/Result'
import { Issue } from '../../schema/models/types/Issue'
import { EvaluationsV2Repository } from '../../repositories'
import { getHITLSpansByDocument } from './getHITLSpansByDocument'
import {
  buildSpanMessagesWithReasons,
  SpanMessagesWithReason,
} from '../../services/spans/buildSpanMessagesWithReasons'

/**
 * Gets the conversation (span messages) for the same document as the issue but without an issue attached.
 * This is used to get positive examples (passed evaluations) to feed the copilot.
 *
 * IMPORTANT:
 * - The evaluation results MUST be from HITL evaluation results, as we want to use the user's annotations to calculate the MCC, not from other evaluations results
 * - The spans MUST be ordered by the createdAt date in descending order to get the latest spans first for generating the most up-to-date config
 */
export async function getSpanMessagesByIssueDocument({
  workspace,
  commit,
  issue,
}: {
  workspace: Workspace
  commit: Commit
  issue: Issue
}) {
  // Three is enough, as we don't want to overfit or add too many tokens to the prompt
  const spansResult = await getHITLSpansByDocument({
    workspace,
    commit,
    documentUuid: issue.documentUuid,
    excludeIssueId: issue.id,
    page: 1,
    pageSize: 3,
    orderDirection: 'desc',
  })

  if (!Result.isOk(spansResult)) {
    return spansResult
  }

  const { spans, evaluationResults } = spansResult.unwrap()

  if (spans.length === 0) {
    return Result.ok([] as SpanMessagesWithReason[])
  }

  const evaluationsRepository = new EvaluationsV2Repository(workspace.id)
  const evaluations = await evaluationsRepository
    .listAtCommitByDocument({
      projectId: commit.projectId,
      commitUuid: commit.uuid,
      documentUuid: issue.documentUuid,
    })
    .then((r) => r.unwrap())

  return buildSpanMessagesWithReasons({
    workspace,
    spans,
    evaluationResults,
    evaluations,
  })
}
