import { Commit } from '../../schema/models/types/Commit'
import { Workspace } from '../../schema/models/types/Workspace'
import { Result } from '../../lib/Result'
import { Issue } from '../../schema/models/types/Issue'
import { Message as LegacyMessage } from '@latitude-data/constants/legacyCompiler'
import { assembleTrace } from '../../services/tracing/traces/assemble'
import {
  adaptCompletionSpanMessagesToLegacy,
  findCompletionSpanFromTrace,
} from '../../services/tracing/spans/findCompletionSpanFromTrace'
import { getHITLSpansByDocument } from './getHITLSpansByDocument'

/*
Gets the conversation (span messages) for the same document as the issue but without an issue attached.
This is used to get positive examples (passed evaluations) to feed the copilot.

We're not getting the reason why the evaluation passed, as the user rarely writes the reason why for good examples (less tokens to add to the prompt).

IMPORTANT:
- The evaluation results MUST be from HITL evaluation results, as we want to use the user's annotations to calculate the MCC, not from other evaluations results
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
    pageSize: 5,
  })

  if (!Result.isOk(spansResult)) {
    return spansResult
  }

  const { spans } = spansResult.unwrap()

  if (spans.length === 0) {
    return Result.ok([] as LegacyMessage[])
  }

  const messagesAndEvaluationResults: LegacyMessage[] = []

  for (const span of spans) {
    // Assemble the trace to get the completion span
    const assembledTrace = await assembleTrace({
      traceId: span.traceId,
      workspace: workspace,
    })

    if (!Result.isOk(assembledTrace)) {
      continue
    }

    const completionSpan = findCompletionSpanFromTrace(
      assembledTrace.value.trace,
    )

    if (!completionSpan) {
      continue
    }

    messagesAndEvaluationResults.push(
      ...adaptCompletionSpanMessagesToLegacy(completionSpan),
    )
  }

  return Result.ok(messagesAndEvaluationResults)
}
