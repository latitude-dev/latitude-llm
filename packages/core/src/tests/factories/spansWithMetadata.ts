import { faker } from '@faker-js/faker'
import {
  CompletionSpanMetadata,
  LogSources,
  PromptSpanMetadata,
  SPAN_METADATA_STORAGE_KEY,
  SpanKind,
  SpanStatus,
  SpanType,
} from '@latitude-data/constants'
import { Message } from '@latitude-data/constants/messages'
import { cache as redis } from '../../cache'
import { diskFactory } from '../../lib/disk'
import { compressString } from '../../lib/disk/compression'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import { createSpan } from './spans'

type BaseSpanWithMetadataParams = {
  workspaceId: number
  traceId?: string
  documentLogUuid?: string
  documentUuid?: string
  commitUuid?: string
  experimentUuid?: string
  projectId?: number
  startedAt?: Date
  source?: LogSources
}

type PromptSpanParams = BaseSpanWithMetadataParams & {
  name?: string
  parameters?: Record<string, unknown>
  template?: string
}

type CompletionSpanParams = BaseSpanWithMetadataParams & {
  parentId: string
  input?: Message[]
  output?: Message[]
  model?: string
  provider?: string
  tokensPrompt?: number
  tokensCompletion?: number
  tokensCached?: number
  tokensReasoning?: number
  cost?: number
}

type PromptWithCompletionParams = BaseSpanWithMetadataParams & {
  promptName?: string
  parameters?: Record<string, unknown>
  template?: string
  input?: Message[]
  output?: Message[]
  model?: string
  provider?: string
  tokensPrompt?: number
  tokensCompletion?: number
  tokensCached?: number
  tokensReasoning?: number
  cost?: number
}

async function storeMetadata({
  workspaceId,
  traceId,
  spanId,
  metadata,
}: {
  workspaceId: number
  traceId: string
  spanId: string
  metadata: PromptSpanMetadata | CompletionSpanMetadata
}) {
  const disk = diskFactory('private')
  const key = SPAN_METADATA_STORAGE_KEY(workspaceId, traceId, spanId)
  const compressed = await compressString(JSON.stringify(metadata))
  await disk.putBuffer(key, compressed)

  const cache = await redis()
  await cache.del(key)
}

export async function createPromptSpan({
  workspaceId,
  traceId = faker.string.alpha({ length: 32 }),
  documentLogUuid = generateUUIDIdentifier(),
  documentUuid,
  commitUuid,
  experimentUuid,
  projectId,
  startedAt = new Date(),
  source = LogSources.API,
  name = 'prompt',
  parameters = {},
  template = 'Test template',
}: PromptSpanParams) {
  const span = await createSpan({
    workspaceId,
    traceId,
    documentLogUuid,
    documentUuid,
    commitUuid,
    experimentUuid,
    projectId,
    type: SpanType.Prompt,
    name,
    kind: SpanKind.Client,
    status: SpanStatus.Ok,
    startedAt,
    source,
  })

  const metadata: PromptSpanMetadata = {
    traceId,
    spanId: span.id,
    type: SpanType.Prompt,
    attributes: {},
    events: [],
    links: [],
    documentLogUuid,
    experimentUuid: experimentUuid ?? '',
    externalId: '',
    parameters,
    projectId: projectId ?? 0,
    promptUuid: documentUuid ?? '',
    source,
    template,
    versionUuid: commitUuid ?? '',
  }

  await storeMetadata({
    workspaceId,
    traceId,
    spanId: span.id,
    metadata,
  })

  return { span, metadata }
}

export async function createCompletionSpan({
  workspaceId,
  traceId = faker.string.alpha({ length: 32 }),
  documentLogUuid,
  documentUuid,
  commitUuid,
  experimentUuid,
  projectId,
  startedAt = new Date(),
  source = LogSources.API,
  parentId,
  input = [],
  output = [],
  model = 'gpt-4o',
  provider = 'openai',
  tokensPrompt,
  tokensCompletion,
  tokensCached,
  tokensReasoning,
  cost,
}: CompletionSpanParams) {
  const span = await createSpan({
    workspaceId,
    traceId,
    documentLogUuid,
    documentUuid,
    commitUuid,
    experimentUuid,
    projectId,
    type: SpanType.Completion,
    parentId,
    kind: SpanKind.Client,
    status: SpanStatus.Ok,
    startedAt,
    source,
    model,
    tokensPrompt,
    tokensCompletion,
    tokensCached,
    tokensReasoning,
    cost,
  })

  const metadata: CompletionSpanMetadata = {
    traceId,
    spanId: span.id,
    type: SpanType.Completion,
    attributes: {},
    events: [],
    links: [],
    provider,
    model,
    configuration: {},
    input: input as any,
    output: output as any,
  }

  await storeMetadata({
    workspaceId,
    traceId,
    spanId: span.id,
    metadata,
  })

  return { span, metadata }
}

export async function createPromptWithCompletion({
  workspaceId,
  traceId = faker.string.alpha({ length: 32 }),
  documentLogUuid = generateUUIDIdentifier(),
  documentUuid,
  commitUuid,
  experimentUuid,
  projectId,
  startedAt = new Date(),
  source = LogSources.API,
  promptName = 'prompt',
  parameters = {},
  template = 'Test template',
  input = [],
  output = [],
  model = 'gpt-4o',
  provider = 'openai',
  tokensPrompt,
  tokensCompletion,
  tokensCached,
  tokensReasoning,
  cost,
}: PromptWithCompletionParams) {
  const { span: promptSpan, metadata: promptMetadata } = await createPromptSpan(
    {
      workspaceId,
      traceId,
      documentLogUuid,
      documentUuid,
      commitUuid,
      experimentUuid,
      projectId,
      startedAt,
      source,
      name: promptName,
      parameters,
      template,
    },
  )

  const { span: completionSpan, metadata: completionMetadata } =
    await createCompletionSpan({
      workspaceId,
      traceId,
      documentLogUuid,
      documentUuid,
      commitUuid,
      experimentUuid,
      projectId,
      startedAt: new Date(startedAt.getTime() + 100),
      source,
      parentId: promptSpan.id,
      input,
      output,
      model,
      provider,
      tokensPrompt,
      tokensCompletion,
      tokensCached,
      tokensReasoning,
      cost,
    })

  return {
    promptSpan,
    completionSpan,
    promptMetadata,
    completionMetadata,
    traceId,
    documentLogUuid,
  }
}

export function createTestMessages({
  userText = 'Hello',
  assistantText = 'Hi there!',
}: {
  userText?: string
  assistantText?: string
} = {}): { input: Message[]; output: Message[] } {
  return {
    input: [
      {
        role: 'user',
        content: [{ type: 'text', text: userText }],
      },
    ],
    output: [
      {
        role: 'assistant',
        content: [{ type: 'text', text: assistantText }],
        toolCalls: [],
      },
    ],
  }
}
