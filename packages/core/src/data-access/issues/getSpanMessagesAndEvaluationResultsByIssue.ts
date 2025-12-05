import { Commit } from '../../schema/models/types/Commit'
import { Workspace } from '../../schema/models/types/Workspace'
import {
  CommitsRepository,
  EvaluationResultsV2Repository,
} from '../../repositories'
import { Result } from '../../lib/Result'
import { EvaluationResultV2 } from '../../constants'
import { Issue } from '../../schema/models/types/Issue'
import { Message as LegacyMessage } from '@latitude-data/constants/legacyCompiler'
import { assembleTrace } from '../../services/tracing/traces/assemble'
import {
  adaptCompletionSpanMessagesToLegacy,
  findCompletionSpanFromTrace,
} from '../../services/tracing/spans/findCompletionSpanFromTrace'
import { UnprocessableEntityError } from '../../lib/errors'
import { getHITLSpansByIssue } from './getHITLSpansByIssue'

export type SpanMessagesWithEvalResultReason = {
  messages: LegacyMessage[]
  reason: string
}

/*
Gets the conversation (span messages) and reason why the evaluation failed the conversation to feed the copilot.

IMPORTANT:
- The spans MUST be from HITL evaluation results, as we want to use the user's annotations to calculate the MCC, not from other evaluations results
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
  const spansResult = await getHITLSpansByIssue({
    workspace: workspace,
    commit: commit,
    issue: issue,
    pageSize: 5,
    page: 1,
  })

  if (!Result.isOk(spansResult)) {
    return spansResult
  }

  const spans = spansResult.unwrap()

  const evaluationResultsRepository = new EvaluationResultsV2Repository(
    workspace.id,
  )
  const commitsRepo = new CommitsRepository(workspace.id)
  const commitHistory = await commitsRepo.getCommitsHistory({ commit })
  const commitHistoryIds = commitHistory.map((c) => c.id)

  const evaluationResultsResult =
    await evaluationResultsRepository.listByIssueIds(
      [issue.id],
      commitHistoryIds,
    )

  const messagesAndEvaluationResults: SpanMessagesWithEvalResultReason[] = []
  for (const span of spans.spans) {
    const assembledTrace = await assembleTrace({
      traceId: span.traceId,
      workspace: workspace,
    })
    if (!Result.isOk(assembledTrace)) {
      return assembledTrace
    }
    const completionSpan = findCompletionSpanFromTrace(
      assembledTrace.value.trace,
    )
    if (!completionSpan) {
      return Result.error(
        new UnprocessableEntityError('Could not find completion span'),
      )
    }

    // There will always be exactly one evaluation result for a span and trace id
    const evaluationResults = evaluationResultsResult.filter(
      (result) =>
        result.evaluatedSpanId === span.id &&
        result.evaluatedTraceId === span.traceId,
    )[0]

    messagesAndEvaluationResults.push({
      messages: adaptCompletionSpanMessagesToLegacy(completionSpan),
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
