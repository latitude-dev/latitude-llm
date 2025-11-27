import { Result } from '../../../lib/Result'
import { CompletionSpanMetadata, Span, SpanType } from '../../../constants'
import { Message } from '@latitude-data/constants/legacyCompiler'
import { SpanMetadatasRepository, SpansRepository } from '../../../repositories'
import { PromisedResult } from '../../../lib/Transaction'

/**
 * Gets messages from a prompt span by finding its completion span
 * and extracting messages from the completion span's metadata.
 */
export async function getMessagesFromSpan({
  workspaceId,
  span,
}: {
  workspaceId: number
  span: Span<SpanType.Prompt>
}): PromisedResult<Message[]> {
  const spansRepo = new SpansRepository(workspaceId)
  const spanMetadataRepo = new SpanMetadatasRepository(workspaceId)

  const completionSpan = await spansRepo
    .findByParentAndType({ parentId: span.id, type: SpanType.Completion })
    .then((r) => r[0])

  if (!completionSpan) {
    return Result.ok([])
  }

  const completionMetadataResult = await spanMetadataRepo.get({
    spanId: completionSpan.id,
    traceId: completionSpan.traceId,
  })

  if (!Result.isOk(completionMetadataResult)) {
    return Result.ok([])
  }

  const completionMetadata = completionMetadataResult.unwrap()
  if (completionMetadata?.type !== SpanType.Completion) {
    return Result.ok([])
  }

  const completionSpanMetadata = completionMetadata as CompletionSpanMetadata
  const messages: Message[] = [
    ...((completionSpanMetadata.input ?? []) as unknown as Message[]),
    ...((completionSpanMetadata.output ?? []) as unknown as Message[]),
  ]

  return Result.ok(messages)
}
