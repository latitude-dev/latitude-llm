import { Workspace } from '../../schema/models/types/Workspace'
import { Span } from '../../constants'
import { Result } from '../../lib/Result'
import { assembleTrace } from '../../services/tracing/traces/assemble'
import { findCompletionSpanFromTrace } from '../../services/tracing/spans/fetching/findCompletionSpanFromTrace'
import { adaptCompletionSpanMessagesToLegacy } from '../../services/tracing/spans/fetching/findCompletionSpanFromTrace'
import { Message as LegacyMessage } from '@latitude-data/constants/legacyCompiler'

export async function getSpanMessagesBySpans({
  workspace,
  spans,
}: {
  workspace: Workspace
  spans: Span[]
}) {
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
