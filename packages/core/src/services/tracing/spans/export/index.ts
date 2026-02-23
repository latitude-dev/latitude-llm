import { SpanMetadata, SpanType } from '@latitude-data/constants'
import {
  SpanMetadatasRepository,
  SpansRepository,
} from '../../../../repositories'
import { DatasetRowData } from '../../../../schema/models/datasetRows'
import { Column } from '../../../../schema/models/datasets'
import { Workspace } from '../../../../schema/models/types/Workspace'
import { Span } from '../../../../constants'
import { buildColumns, FixedColumnsByName } from './buildColumns'
import { formatMessage } from '../../../../helpers'
import { Message } from '@latitude-data/constants/messages'
import { HashAlgorithmFn, nanoidHashAlgorithm } from '../../../datasets/utils'
import { Dataset } from '../../../../schema/models/types/Dataset'
import { PromisedResult } from '../../../../lib/Transaction'
import { Result } from '../../../../lib/Result'

export type ExportedSpans = {
  columns: Column[]
  rows: DatasetRowData[]
}

type SpanIdentifier = {
  traceId: string
  spanId: string
}

async function findSpans({
  workspace,
  spanIdentifiers,
}: {
  workspace: Workspace
  spanIdentifiers: SpanIdentifier[]
}) {
  const repo = new SpansRepository(workspace.id)
  const spans: Span[] = []

  for (const { traceId, spanId } of spanIdentifiers) {
    const result = await repo.get({ traceId, spanId })
    if (result.ok) {
      spans.push(result.value!)
    }
  }

  return spans.filter((span) => span.type === SpanType.Prompt)
}

async function findSpanMetadatas({
  workspace,
  spans,
}: {
  workspace: Workspace
  spans: Span[]
}) {
  const metadataRepo = new SpanMetadatasRepository(workspace.id)
  const metadatas = new Map<string, SpanMetadata<SpanType.Prompt>>()

  for (const span of spans) {
    const result = await metadataRepo.get({
      spanId: span.id,
      traceId: span.traceId,
    })
    if (result.ok && result.value?.type === SpanType.Prompt) {
      metadatas.set(`${span.traceId}:${span.id}`, result.value)
    }
  }

  return metadatas
}

async function findCompletionSpans({
  workspace,
  spans,
}: {
  workspace: Workspace
  spans: Span[]
}) {
  const repo = new SpansRepository(workspace.id)
  const completionSpans = new Map<string, Span<SpanType.Completion>>()

  for (const span of spans) {
    const children = await repo.findByParentAndType({
      parentId: span.id,
      type: SpanType.Completion,
      pkFilters: {
        projectId: span.projectId ?? undefined,
        commitUuid: span.commitUuid ?? undefined,
        documentUuid: span.documentUuid ?? undefined,
      },
    })

    if (children.length > 0) {
      // Get the first completion span (there should typically be one)
      const completionSpan = children[0]! as Span<SpanType.Completion>
      completionSpans.set(`${span.traceId}:${span.id}`, completionSpan)
    }
  }

  return completionSpans
}

async function findCompletionOutputs({
  workspace,
  completionSpans,
}: {
  workspace: Workspace
  completionSpans: Map<string, Span<SpanType.Completion>>
}) {
  const metadataRepo = new SpanMetadatasRepository(workspace.id)
  const outputs = new Map<string, string>()

  for (const [key, completionSpan] of completionSpans.entries()) {
    const result = await metadataRepo.get({
      spanId: completionSpan.id,
      traceId: completionSpan.traceId,
    })

    if (result.ok && result.value?.type === SpanType.Completion) {
      // Extract output from completion metadata
      const output = result.value.output
      if (output && Array.isArray(output) && output.length > 0) {
        // Format the last message (most recent output)
        const lastMessage = output[output.length - 1]
        if (lastMessage) {
          const formatted = formatMessage(lastMessage as unknown as Message)
          if (formatted) {
            outputs.set(key, formatted)
          }
        }
      }
    }
  }

  return outputs
}

function buildRow({
  span,
  completionSpan,
  metadata,
  output,
  parametersByName,
  fixedColumnsByName,
}: {
  span: Span<SpanType.Prompt>
  completionSpan?: Span<SpanType.Completion>
  metadata?: SpanMetadata<SpanType.Prompt>
  output?: string
  parametersByName: Record<string, Column>
  fixedColumnsByName: FixedColumnsByName
}) {
  if (!output) return null

  const parameters = metadata?.parameters ?? {}

  const spanParameterColumns: DatasetRowData = {}

  for (const [name, column] of Object.entries(parametersByName)) {
    const value = parameters[name]
    spanParameterColumns[column.identifier] =
      value !== undefined ? (value as DatasetRowData[keyof DatasetRowData]) : ''
  }

  const tokenSource = completionSpan ?? span
  const tokens =
    ((tokenSource as any).tokensPrompt ?? 0) +
    ((tokenSource as any).tokensCompletion ?? 0) +
    ((tokenSource as any).tokensCached ?? 0) +
    ((tokenSource as any).tokensReasoning ?? 0)

  return {
    ...spanParameterColumns,
    [fixedColumnsByName.label.identifier]: output,
    [fixedColumnsByName.spanId.identifier]: span.id,
    [fixedColumnsByName.traceId.identifier]: span.traceId,
    [fixedColumnsByName.tokens.identifier]: tokens,
  }
}

/**
 * This service is responsible for extracting all data
 * interesting to run evaluations from spans.
 * At the time of writing this is used to store the spans as
 * dataset rows in an existing dataset or new dataset.
 *
 * Extracted data:
 * - Parameters (from prompt span metadata)
 * - Expected Output (from completion span metadata)
 * - Span id
 * - Trace id
 * - Tokens
 */
export async function buildSpanDatasetRows({
  workspace,
  dataset,
  spanIdentifiers,
  hashAlgorithm = nanoidHashAlgorithm,
}: {
  workspace: Workspace
  spanIdentifiers: SpanIdentifier[]
  dataset?: Dataset
  hashAlgorithm?: HashAlgorithmFn
}): PromisedResult<ExportedSpans> {
  const spans = await findSpans({ workspace, spanIdentifiers })
  const metadatas = await findSpanMetadatas({ workspace, spans })
  const completionSpans = await findCompletionSpans({ workspace, spans })
  const outputs = await findCompletionOutputs({
    workspace,
    completionSpans,
  })

  const columns = buildColumns({
    dataset,
    hashAlgorithm,
    spans: spans as Span<SpanType.Prompt>[],
    metadatas,
  })
  const rows = spans
    .map((span) => {
      const key = `${span.traceId}:${span.id}`
      const metadata = metadatas.get(key)
      const output = outputs.get(key)
      const completionSpan = completionSpans.get(key)
      return buildRow({
        span: span as Span<SpanType.Prompt>,
        completionSpan,
        metadata,
        output,
        parametersByName: columns.parametersByName,
        fixedColumnsByName: columns.fixedColumnsByName,
      })
    })
    .filter((row) => row !== null)

  return Result.ok({ columns: columns.allColumns, rows })
}
