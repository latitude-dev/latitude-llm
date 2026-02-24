import {
  CompletionSpanMetadata,
  Span,
  SpanKind,
  SpanMetadata,
  SpanStatus,
  SpanType,
} from '../../../../constants'
import { Database } from '../../../../client'
import { Result, TypedResult } from '../../../../lib/Result'
import { spans } from '../../../../schema/models/spans'

export type PostgresSpanInput = {
  id: string
  traceId: string
  parentId?: string
  workspaceId: number
  apiKeyId: number
  name: string
  kind: SpanKind
  type: SpanType
  status: SpanStatus
  message?: string
  duration: number
  startedAt: Date
  endedAt: Date
  metadata: SpanMetadata
}

export async function bulkCreate(
  spansToInsert: PostgresSpanInput[],
  tx: Database,
): Promise<TypedResult<Span[]>> {
  const insertData = spansToInsert.map((span) => {
    let completionMetadata: CompletionSpanMetadata | undefined
    if (span.type === SpanType.Completion) {
      completionMetadata = span.metadata as CompletionSpanMetadata
    }

    return {
      id: span.id,
      traceId: span.traceId,
      parentId: span.parentId,
      workspaceId: span.workspaceId,
      apiKeyId: span.apiKeyId,
      name: span.name,
      kind: span.kind,
      type: span.type,
      status: span.status,
      message: span.message,
      duration: span.duration,
      startedAt: span.startedAt,
      endedAt: span.endedAt,
      source: 'source' in span.metadata ? span.metadata.source : undefined,
      tokensPrompt: completionMetadata?.tokens?.prompt,
      tokensCompletion: completionMetadata?.tokens?.completion,
      tokensCached: completionMetadata?.tokens?.cached,
      tokensReasoning: completionMetadata?.tokens?.reasoning,
      model: completionMetadata?.model,
      cost: completionMetadata?.cost,
      documentLogUuid:
        'documentLogUuid' in span.metadata
          ? (span.metadata.documentLogUuid as string)
          : undefined,
      documentUuid:
        'promptUuid' in span.metadata
          ? (span.metadata.promptUuid as string)
          : undefined,
      commitUuid:
        'versionUuid' in span.metadata
          ? (span.metadata.versionUuid as string)
          : undefined,
      experimentUuid:
        'experimentUuid' in span.metadata
          ? (span.metadata.experimentUuid as string)
          : undefined,
      testDeploymentId:
        'testDeploymentId' in span.metadata
          ? (span.metadata.testDeploymentId as number)
          : undefined,
      projectId:
        'projectId' in span.metadata
          ? (span.metadata.projectId as number)
          : undefined,
    }
  })

  const insertedSpans = await tx
    .insert(spans)
    .values(insertData)
    .returning()
    .then((r) => r as Span[])

  return Result.ok(insertedSpans)
}
