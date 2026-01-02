import { Commit } from '../../schema/models/types/Commit'
import { Workspace } from '../../schema/models/types/Workspace'
import { Result } from '../../lib/Result'
import { Issue } from '../../schema/models/types/Issue'
import { Message as LegacyMessage } from '@latitude-data/constants/legacyCompiler'
import { getHITLSpansByDocument } from './getHITLSpansByDocument'
import { getSpanMessagesBySpans } from './getSpanMessagesBySpans'

/*
Gets the conversation (span messages) for the same document as the issue but without an issue attached.
This is used to get positive examples (passed evaluations) to feed the copilot.

We're not getting the reason why the evaluation passed, as the user rarely writes the reason why for good examples (less tokens to add to the prompt).

IMPORTANT:
- The evaluation results MUST be from HITL evaluation results, as we want to use the user's annotations to calculate the MCC, not from other evaluations results
- The spans MUST be ordered by the createdAt date in descending order to get the latest spans first for generating the most up-to-date config
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

  const { spans } = spansResult.unwrap()

  if (spans.length === 0) {
    return Result.ok([] as LegacyMessage[])
  }

  return await getSpanMessagesBySpans({
    workspace,
    spans,
  })
}
