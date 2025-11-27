import { Commit } from '../../schema/models/types/Commit'
import { Workspace } from '../../schema/models/types/Workspace'
import { EvaluationResultsV2Repository } from '../../repositories'
import { Result } from '../../lib/Result'
import { EvaluationResultV2, Span, SpanType } from '../../constants'
import { Issue } from '../../schema/models/types/Issue'
import { getSpansByIssue } from '../../data-access/issues/getSpansByIssue'
import { Message as LegacyMessage } from '@latitude-data/constants/legacyCompiler'
import { getMessagesFromSpan } from '../../services/tracing/spans/getMessages'

export type SpanMessagesWithEvalResultReason = {
  messages: LegacyMessage[]
  reason: string
}

/*
Gets the conversation (span messages) and reason why the evaluation failed the conversation to feed the copilot.
*/
export async function getSpanMessagesAndEvaluationResultsByIssue({
  workspace,
  commit,
  issue,
}: {
  workspace: Workspace
  commit: Commit
  issue: Issue
}) {
  // Three is enough, as we don't want to overfit or add too many tokens to the prompt
  const spansResult = await getSpansByIssue({
    workspace: workspace,
    commit: commit,
    issue: issue,
    pageSize: 3,
    page: 1,
  })

  if (!Result.isOk(spansResult)) {
    return spansResult
  }

  const spans = spansResult.unwrap()

  const evaluationResultsRepository = new EvaluationResultsV2Repository(
    workspace.id,
  )
  const evaluationResultsResult =
    await evaluationResultsRepository.listByIssueIds([issue.id])

  const messagesAndEvaluationResults: SpanMessagesWithEvalResultReason[] = []
  for (const span of spans.spans) {
    const messagesResult = await getMessagesFromSpan({
      workspaceId: workspace.id,
      span: span as Span<SpanType.Prompt>,
    })
    if (!Result.isOk(messagesResult)) {
      continue
    }

    // There will always be exactly one evaluation result for a span and trace id
    const evaluationResults = evaluationResultsResult.filter(
      (result) =>
        result.evaluatedSpanId === span.id &&
        result.evaluatedTraceId === span.traceId,
    )[0]

    messagesAndEvaluationResults.push({
      messages: messagesResult.value,
      reason: getReasonFromEvaluationResult(evaluationResults),
    })
  }

  return Result.ok(messagesAndEvaluationResults)
}

// We need an efficient way of extracting reasons directly from metadata without fetching evaluations
function getReasonFromEvaluationResult(result: EvaluationResultV2) {
  if (result.error || !result.metadata) {
    return ''
  }

  // LLM, Rule, and Human evaluations all have a reason field (required for LLM, optional for Rule/Human)
  if ('reason' in result.metadata && result.metadata.reason) {
    return result.metadata.reason ?? ''
  }
  return ''
}
