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

export async function getSpanMessagesByIssueDocument({
  workspace,
  commit,
  issue,
}: {
  workspace: Workspace
  commit: Commit
  issue: Issue
}) {
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
