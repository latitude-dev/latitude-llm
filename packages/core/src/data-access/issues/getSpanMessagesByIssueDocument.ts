import { Commit } from '../../schema/models/types/Commit'
import { Workspace } from '../../schema/models/types/Workspace'
import {
  CommitsRepository,
  EvaluationResultsV2Repository,
  SpansRepository,
} from '../../repositories'
import { Result } from '../../lib/Result'
import { Issue } from '../../schema/models/types/Issue'
import { Message as LegacyMessage } from '@latitude-data/constants/legacyCompiler'
import { assembleTrace } from '../../services/tracing/traces/assemble'
import {
  adaptCompletionSpanMessagesToLegacy,
  findCompletionSpanFromTrace,
} from '../../services/tracing/spans/findCompletionSpanFromTrace'

/*
Gets the conversation (span messages) for the same document as the issue but without an issue attached.
This is used to get positive examples (passed evaluations) to feed the copilot.

We're not getting the reason why the evaluation passed, as the user rarely writes the reason why for good examples (less tokens to add to the prompt).
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
  const evaluationResultsRepository = new EvaluationResultsV2Repository(
    workspace.id,
  )
  const commitsRepo = new CommitsRepository(workspace.id)
  const commitHistory = await commitsRepo.getCommitsHistory({ commit })
  const commitHistoryIds = commitHistory.map((c) => c.id)

  // Get passed evaluation results for the same document (without an issue attached)
  // Three is enough, as we don't want to overfit or add too many tokens to the prompt
  const { results: passedEvaluationResults } =
    await evaluationResultsRepository.listPassedByDocumentUuid(
      issue.documentUuid,
      commitHistoryIds,
      { page: 1, pageSize: 3 },
    )

  const spansRepository = new SpansRepository(workspace.id)
  const messagesAndEvaluationResults: LegacyMessage[] = []

  for (const evaluationResult of passedEvaluationResults) {
    // Skip if evaluation result doesn't have span references
    if (
      !evaluationResult.evaluatedSpanId ||
      !evaluationResult.evaluatedTraceId
    ) {
      continue
    }

    // Get the span for this evaluation result
    const spanResult = await spansRepository.get({
      spanId: evaluationResult.evaluatedSpanId,
      traceId: evaluationResult.evaluatedTraceId,
    })

    if (!Result.isOk(spanResult)) {
      continue
    }

    const span = spanResult.unwrap()
    if (!span) {
      continue
    }

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
