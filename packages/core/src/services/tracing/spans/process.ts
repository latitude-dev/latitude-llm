import { database } from '../../../client'
import {
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
  GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
  GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT,
  GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION,
} from '@opentelemetry/semantic-conventions/incubating'
import {
  AI_OPERATION_ID_VALUE_GENERATE_OBJECT,
  AI_OPERATION_ID_VALUE_GENERATE_TEXT,
  AI_OPERATION_ID_VALUE_STREAM_OBJECT,
  AI_OPERATION_ID_VALUE_STREAM_TEXT,
  AI_OPERATION_ID_VALUE_TOOL,
  ATTRIBUTES,
  GEN_AI_OPERATION_NAME_VALUE_COMPLETION,
  GEN_AI_OPERATION_NAME_VALUE_EMBEDDING,
  GEN_AI_OPERATION_NAME_VALUE_RERANKING,
  GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL,
  GEN_AI_OPERATION_NAME_VALUE_TOOL,
  LLM_REQUEST_TYPE_VALUE_CHAT,
  LLM_REQUEST_TYPE_VALUE_COMPLETION,
  LLM_REQUEST_TYPE_VALUE_EMBEDDING,
  LLM_REQUEST_TYPE_VALUE_RERANK,
  Otlp,
  SpanAttribute,
  SpanStatus,
  SpanType,
} from '../../../constants'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { UnprocessableEntityError } from '../../../lib/errors'
import { Result, TypedResult } from '../../../lib/Result'
import { ApiKeysRepository } from '../../../repositories'
import { type ApiKey } from '../../../schema/models/types/ApiKey'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { internalBaggageSchema } from '../../../telemetry'

export function convertSpanAttribute(
  attribute: Otlp.AttributeValue,
): TypedResult<SpanAttribute> {
  if (attribute.stringValue != undefined) {
    return Result.ok(attribute.stringValue)
  }

  if (attribute.intValue != undefined) {
    return Result.ok(attribute.intValue)
  }

  if (attribute.boolValue != undefined) {
    return Result.ok(attribute.boolValue)
  }

  if (attribute.arrayValue != undefined) {
    const values = attribute.arrayValue.values.map(convertSpanAttribute)
    if (values.some((v) => v.error)) return Result.error(values[0]!.error!)

    return Result.ok(values.map((v) => v.value!))
  }

  return Result.error(new UnprocessableEntityError('Invalid attribute value'))
}

export function convertSpanAttributes(
  attributes: Otlp.Attribute[],
): TypedResult<Record<string, SpanAttribute>> {
  const result: Record<string, SpanAttribute> = {}

  for (const attribute of attributes) {
    const converting = convertSpanAttribute(attribute.value)
    if (converting.error) continue // we skip invalid attributes for now

    result[attribute.key] = converting.value
  }

  return Result.ok(result)
}

export function extractSpanType(
  attributes: Record<string, SpanAttribute>,
): TypedResult<SpanType> {
  const type = String(attributes[ATTRIBUTES.LATITUDE.type] ?? '')
  switch (type) {
    case SpanType.Tool:
      return Result.ok(SpanType.Tool)
    case SpanType.Completion:
      return Result.ok(SpanType.Completion)
    case SpanType.Embedding:
      return Result.ok(SpanType.Embedding)
    case SpanType.Retrieval:
      return Result.ok(SpanType.Retrieval)
    case SpanType.Reranking:
      return Result.ok(SpanType.Reranking)
    case SpanType.Http:
      return Result.ok(SpanType.Http)
    case SpanType.Prompt:
      return Result.ok(SpanType.Prompt)
    case SpanType.Chat:
      return Result.ok(SpanType.Chat)
    case SpanType.External:
      return Result.ok(SpanType.External)
    case SpanType.UnresolvedExternal:
      return Result.ok(SpanType.UnresolvedExternal)
    case SpanType.Step:
      return Result.ok(SpanType.Step)
    case SpanType.Unknown:
      return Result.ok(SpanType.Unknown)
  }

  let operation = String(
    attributes[ATTRIBUTES.OPENTELEMETRY.GEN_AI.operationName] ?? '',
  )
  switch (operation) {
    case GEN_AI_OPERATION_NAME_VALUE_TOOL:
    case GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL:
      return Result.ok(SpanType.Tool)
    case GEN_AI_OPERATION_NAME_VALUE_COMPLETION:
    case GEN_AI_OPERATION_NAME_VALUE_CHAT:
    case GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION:
    case GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT:
      return Result.ok(SpanType.Completion)
    case GEN_AI_OPERATION_NAME_VALUE_EMBEDDING:
    case GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS:
      return Result.ok(SpanType.Embedding)
    case GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL:
      return Result.ok(SpanType.Retrieval)
    case GEN_AI_OPERATION_NAME_VALUE_RERANKING:
      return Result.ok(SpanType.Reranking)
  }

  const request = String(
    attributes[ATTRIBUTES.OPENLLMETRY.llm.request.type] ?? '',
  )
  switch (request) {
    case LLM_REQUEST_TYPE_VALUE_COMPLETION:
    case LLM_REQUEST_TYPE_VALUE_CHAT:
      return Result.ok(SpanType.Completion)
    case LLM_REQUEST_TYPE_VALUE_EMBEDDING:
      return Result.ok(SpanType.Embedding)
    case LLM_REQUEST_TYPE_VALUE_RERANK:
      return Result.ok(SpanType.Reranking)
  }

  operation = String(attributes[ATTRIBUTES.AI_SDK.operationId] ?? '')
  switch (operation) {
    case AI_OPERATION_ID_VALUE_TOOL:
      return Result.ok(SpanType.Tool)
    case AI_OPERATION_ID_VALUE_GENERATE_TEXT:
    case AI_OPERATION_ID_VALUE_STREAM_TEXT:
    case AI_OPERATION_ID_VALUE_GENERATE_OBJECT:
    case AI_OPERATION_ID_VALUE_STREAM_OBJECT:
      return Result.ok(SpanType.Completion)
  }

  return Result.ok(SpanType.Unknown)
}

export function convertSpanStatus(
  status: Otlp.Status,
): TypedResult<SpanStatus> {
  switch (status.code) {
    case Otlp.StatusCode.Ok:
      return Result.ok(SpanStatus.Ok)
    case Otlp.StatusCode.Error:
      return Result.ok(SpanStatus.Error)
    default:
      return Result.ok(SpanStatus.Unset)
  }
}

export async function extractApiKeyAndWorkspace(
  {
    apiKeyId,
    workspaceId,
    attributes,
  }: {
    apiKeyId?: number
    workspaceId?: number
    attributes: Record<string, SpanAttribute>
  },
  db = database,
): Promise<TypedResult<{ apiKey: ApiKey; workspace: Workspace }>> {
  let internal
  if (!workspaceId) {
    const extracting = extractInternal(attributes)
    if (extracting.error) return Result.error(extracting.error)
    internal = extracting.value
  }

  const gettingWorkspace = await getWorkspace(
    { workspaceId: workspaceId ?? internal?.workspaceId },
    db,
  )
  if (gettingWorkspace.error) return Result.error(gettingWorkspace.error)
  const workspace = gettingWorkspace.value

  const gettingApiKey = await getApiKey(
    { apiKeyId: apiKeyId ?? internal?.apiKeyId, workspace },
    db,
  )
  if (gettingApiKey.error) return Result.error(gettingApiKey.error)
  const apiKey = gettingApiKey.value

  return Result.ok({ apiKey, workspace })
}

function extractInternal(attributes: Record<string, SpanAttribute>) {
  const attribute = String(attributes[ATTRIBUTES.LATITUDE.internal] ?? '')
  if (!attribute) {
    return Result.error(
      new UnprocessableEntityError('Internal baggage is required'),
    )
  }

  try {
    const payload = JSON.parse(attribute)
    const baggage = internalBaggageSchema.parse(payload)

    return Result.ok(baggage)
  } catch (error) {
    return Result.error(
      new UnprocessableEntityError('Invalid internal baggage'),
    )
  }
}

async function getWorkspace(
  {
    workspaceId,
  }: {
    workspaceId?: number
  },
  db = database,
) {
  if (!workspaceId) {
    return Result.error(new UnprocessableEntityError('Workspace is required'))
  }

  const workspace = await unsafelyFindWorkspace(workspaceId, db)
  if (!workspace) {
    return Result.error(new UnprocessableEntityError('Workspace not found'))
  }

  return Result.ok(workspace)
}

async function getApiKey(
  {
    apiKeyId,
    workspace,
  }: {
    apiKeyId?: number
    workspace: Workspace
  },
  db = database,
) {
  const repository = new ApiKeysRepository(workspace.id, db)

  let apiKey
  if (apiKeyId) {
    const finding = await repository.find(apiKeyId)
    if (finding.error) {
      return Result.error(new UnprocessableEntityError('API key not found'))
    }
    apiKey = finding.value
  } else {
    const finding = await repository.selectFirst()
    if (finding.error) {
      return Result.error(new UnprocessableEntityError('API key not found'))
    }
    apiKey = finding.value
  }

  if (!apiKey) {
    return Result.error(new UnprocessableEntityError('API key is required'))
  }

  return Result.ok(apiKey)
}
