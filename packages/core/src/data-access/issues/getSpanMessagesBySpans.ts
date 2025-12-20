import { Workspace } from '../../schema/models/types/Workspace'
import { Span } from '../../constants'
import { Result } from '../../lib/Result'
import { assembleTraceWithMessages } from '../../services/tracing/traces/assemble'
import { adaptCompletionSpanMessagesToLegacy } from '../../services/tracing/spans/findCompletionSpanFromTrace'
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
    const assembledTraceResult = await assembleTraceWithMessages({
      traceId: span.traceId,
      workspace: workspace,
    })

    if (!Result.isOk(assembledTraceResult)) {
      continue
    }

    const { completionSpan } = assembledTraceResult.unwrap()
    if (!completionSpan) {
      continue
    }

    messagesAndEvaluationResults.push(
      ...adaptCompletionSpanMessagesToLegacy(completionSpan),
    )
  }

  return Result.ok(messagesAndEvaluationResults)
}
