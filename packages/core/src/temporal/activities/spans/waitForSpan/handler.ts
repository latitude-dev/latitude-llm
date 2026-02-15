import { Context } from '@temporalio/activity'
import { SpanType } from '../../../../constants'
import { SpansRepository } from '../../../../repositories'

export async function waitForSpanActivityHandler({
  workspaceId,
  conversationUuid,
  maxAttempts = 60,
  delayMs = 1000,
}: {
  workspaceId: number
  conversationUuid: string
  maxAttempts?: number
  delayMs?: number
}) {
  const spansRepo = new SpansRepository(workspaceId)

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    Context.current().heartbeat(`Waiting for span, attempt ${attempt + 1}`)

    const traceId = await spansRepo.getLastTraceByLogUuid(conversationUuid)
    if (traceId) {
      const spans = await spansRepo
        .list({ traceId })
        .then((r) => r.unwrap().filter((span) => span.type === SpanType.Prompt))

      if (spans.length > 0) {
        return {
          found: true,
          spanId: spans[0]!.id,
          traceId,
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  return { found: false }
}
