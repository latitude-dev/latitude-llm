import { database } from '../../../../client'
import {
  ATTRIBUTES,
  Otlp,
  SpanAttribute,
  SpanStatus,
  SpanType,
  VALUES,
} from '../../../../constants'
import { unsafelyFindWorkspace } from '../../../../data-access/workspaces'
import { UnprocessableEntityError } from '../../../../lib/errors'
import { Result, TypedResult } from '../../../../lib/Result'
import { ApiKeysRepository } from '../../../../repositories'
import { type ApiKey } from '../../../../schema/models/types/ApiKey'
import { type Workspace } from '../../../../schema/models/types/Workspace'
import { internalBaggageSchema } from '../../../../telemetry'

function convertSpanAttribute(
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
    const arrayValues = attribute.arrayValue.values
    if (!arrayValues || arrayValues.length === 0) {
      return Result.ok([])
    }
    const values = arrayValues.map(convertSpanAttribute)
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

/**
 * Detects the custom Latitude span type from any span attributes.
 * If no custom type is found, it falls back to Unknown.
 */
export function extractSpanType(
  attributes: Record<string, SpanAttribute>,
): TypedResult<SpanType> {
  // If already processed
  const latitudeType = attributes[ATTRIBUTES.LATITUDE.type]
  if (latitudeType) {
    switch (String(latitudeType)) {
      case SpanType.Prompt:
        return Result.ok(SpanType.Prompt)
      case SpanType.Chat:
        return Result.ok(SpanType.Chat)
      case SpanType.External:
        return Result.ok(SpanType.External)
      case SpanType.UnresolvedExternal:
        return Result.ok(SpanType.UnresolvedExternal)
      case SpanType.Completion:
        return Result.ok(SpanType.Completion)
      case SpanType.Embedding:
        return Result.ok(SpanType.Embedding)
      case SpanType.Tool:
        return Result.ok(SpanType.Tool)
      case SpanType.Http:
        return Result.ok(SpanType.Http)
      case SpanType.Unknown:
        return Result.ok(SpanType.Unknown)
    }
  }

  // OpenTelemetry
  const genAiOperation = attributes[ATTRIBUTES.OPENTELEMETRY.GEN_AI.operation]
  if (genAiOperation) {
    switch (String(genAiOperation)) {
      case VALUES.OPENTELEMETRY.GEN_AI.operation.chat:
      case VALUES.OPENTELEMETRY.GEN_AI.operation.generateContent:
      case VALUES.OPENTELEMETRY.GEN_AI.operation.textCompletion:
      case VALUES.OPENTELEMETRY.GEN_AI._deprecated.operation.completion:
        return Result.ok(SpanType.Completion)

      case VALUES.OPENTELEMETRY.GEN_AI.operation.embeddings:
      case VALUES.OPENTELEMETRY.GEN_AI._deprecated.operation.embedding:
        return Result.ok(SpanType.Embedding)

      case VALUES.OPENTELEMETRY.GEN_AI.operation.executeTool:
      case VALUES.OPENTELEMETRY.GEN_AI._deprecated.operation.tool:
        return Result.ok(SpanType.Tool)
    }
  }

  // OpenLLMetry
  const openLlmetryRequestType =
    attributes[ATTRIBUTES.OPENLLMETRY.llm.request.type]
  if (openLlmetryRequestType) {
    switch (String(openLlmetryRequestType)) {
      case VALUES.OPENLLMETRY.llm.request.type.completion:
      case VALUES.OPENLLMETRY.llm.request.type.chat:
        return Result.ok(SpanType.Completion)
      case VALUES.OPENLLMETRY.llm.request.type.embedding:
        return Result.ok(SpanType.Embedding)
    }
  }

  // AI SDK
  const aiSdkOperationId = attributes[ATTRIBUTES.AI_SDK.operationId]
  if (aiSdkOperationId) {
    switch (String(aiSdkOperationId)) {
      case VALUES.AI_SDK.operationId.generateTextDoGenerate:
      case VALUES.AI_SDK.operationId.streamTextDoStream:
      case VALUES.AI_SDK.operationId.generateObjectDoGenerate:
      case VALUES.AI_SDK.operationId.streamObjectDoStream:
        return Result.ok(SpanType.Completion)

      case VALUES.AI_SDK.operationId.embedDoEmbed:
      case VALUES.AI_SDK.operationId.embedManyDoEmbed:
        return Result.ok(SpanType.Embedding)

      case VALUES.AI_SDK.operationId.toolCall:
        return Result.ok(SpanType.Tool)
    }
  }

  // OpenInference (Arize/Phoenix)
  const openInferenceSpanKind = attributes[ATTRIBUTES.OPENINFERENCE.span.kind]
  if (openInferenceSpanKind) {
    switch (String(openInferenceSpanKind)) {
      case VALUES.OPENINFERENCE.span.kind.llm:
        return Result.ok(SpanType.Completion)
      case VALUES.OPENINFERENCE.span.kind.embedding:
        return Result.ok(SpanType.Embedding)
      case VALUES.OPENINFERENCE.span.kind.tool:
        return Result.ok(SpanType.Tool)
    }
  }

  // Fallback: If we have gen_ai.system and gen_ai.request.model, it's likely a completion
  // This handles instrumentations like Bedrock that don't set an explicit operation type
  const genAiSystem =
    attributes[ATTRIBUTES.OPENTELEMETRY.GEN_AI._deprecated.system] ||
    attributes['gen_ai.system']
  const genAiRequestModel =
    attributes[ATTRIBUTES.LATITUDE.request.model] ||
    attributes['gen_ai.request.model']
  if (genAiSystem && genAiRequestModel) {
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
  const attribute = attributes[ATTRIBUTES.LATITUDE.internal]
  if (!attribute) {
    return Result.error(
      new UnprocessableEntityError('Internal baggage is required'),
    )
  }

  try {
    const payload = JSON.parse(String(attribute))
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
