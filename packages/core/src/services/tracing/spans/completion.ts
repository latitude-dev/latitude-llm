import { ATTRIBUTES, Providers } from '@latitude-data/constants'
import { database } from '../../../client'
import {
  CompletionSpanMetadata,
  GEN_AI_RESPONSE_FINISH_REASON_VALUE_CONTENT_FILTER,
  GEN_AI_RESPONSE_FINISH_REASON_VALUE_ERROR,
  GEN_AI_RESPONSE_FINISH_REASON_VALUE_LENGTH,
  GEN_AI_RESPONSE_FINISH_REASON_VALUE_OTHER,
  GEN_AI_RESPONSE_FINISH_REASON_VALUE_STOP,
  GEN_AI_RESPONSE_FINISH_REASON_VALUE_TOOL_CALLS,
  GEN_AI_RESPONSE_FINISH_REASON_VALUE_UNKNOWN,
  SPAN_SPECIFICATIONS,
  SpanAttribute,
  SpanStatus,
  SpanType,
} from '../../../constants'
import { UnprocessableEntityError } from '../../../lib/errors'
import { Result, TypedResult } from '../../../lib/Result'
import { ProviderApiKeysRepository } from '../../../repositories'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { estimateCost } from '../../ai/estimateCost'
import { SpanProcessArgs, toCamelCase } from './shared'
import {
  extractAllAttributes,
  extractAttribute,
} from '../../../../../constants/src/tracing/attributes'
import { extractInput, extractOutput } from './completion/extractMessages'

const specification = SPAN_SPECIFICATIONS[SpanType.Completion]
export const CompletionSpanSpecification = {
  ...specification,
  process: process,
}

async function process(
  { attributes, status, workspace }: SpanProcessArgs<SpanType.Completion>,
  db = database,
) {
  const extractingcp = extractProvider(attributes)
  if (extractingcp.error) return Result.error(extractingcp.error)
  const provider = extractingcp.value

  const extractingcm = extractModel(attributes)
  if (extractingcm.error) return Result.error(extractingcm.error)
  const model = extractingcm.value

  const extractingcc = extractConfiguration(attributes)
  if (extractingcc.error) return Result.error(extractingcc.error)
  const configuration = extractingcc.value

  const extractingci = extractInput(attributes)
  if (extractingci.error) return Result.error(extractingci.error)
  const input = extractingci.value

  if (status === SpanStatus.Error) {
    return Result.ok({
      provider: provider,
      model: model,
      configuration: configuration,
      input: input,
    })
  }

  const extractingco = extractOutput(attributes)
  if (extractingco.error) return Result.error(extractingco.error)
  const output = extractingco.value

  const extractingpt = extractPromptTokens(attributes)
  if (extractingpt.error) return Result.error(extractingpt.error)
  const promptTokens = extractingpt.value

  const extractinght = extractCachedTokens(attributes)
  if (extractinght.error) return Result.error(extractinght.error)
  const cachedTokens = extractinght.value

  const extractingrt = extractReasoningTokens(attributes)
  if (extractingrt.error) return Result.error(extractingrt.error)
  const reasoningTokens = extractingrt.value

  const extractingct = extractCompletionTokens(attributes)
  if (extractingct.error) return Result.error(extractingct.error)
  const completionTokens = extractingct.value

  const tokens = {
    prompt: promptTokens,
    cached: cachedTokens,
    reasoning: reasoningTokens,
    completion: completionTokens,
  }

  const enrichingcs = await enrichCost(provider, model, tokens, workspace, db)
  if (enrichingcs.error) return Result.error(enrichingcs.error)
  const cost = enrichingcs.value

  const extractingfr = extractFinishReason(attributes)
  if (extractingfr.error) return Result.error(extractingfr.error)
  const finishReason = extractingfr.value

  return Result.ok({
    provider: provider,
    model: model,
    configuration: configuration,
    input: input,
    output: output,
    tokens: tokens,
    cost: cost,
    finishReason: finishReason,

    // References
    promptUuid: attributes[ATTRIBUTES.LATITUDE.documentUuid] as string,
    versionUuid: attributes[ATTRIBUTES.LATITUDE.commitUuid] as string,
    experimentUuid: attributes[ATTRIBUTES.LATITUDE.experimentUuid] as string,
  })
}

function extractProvider(
  attributes: Record<string, SpanAttribute>,
): TypedResult<CompletionSpanMetadata['provider']> {
  const value = extractAttribute({
    attributes,
    keys: [
      ATTRIBUTES.OPENTELEMETRY.GEN_AI.system,
      ATTRIBUTES.OPENINFERENCE.llm.system,
      ATTRIBUTES.OPENINFERENCE.llm.provider,
      ATTRIBUTES.AI_SDK.model.provider,
    ],
  })
  if (value) return Result.ok(value)
  return Result.error(
    new UnprocessableEntityError('Completion provider is required'),
  )
}

function extractModel(
  attributes: Record<string, SpanAttribute>,
): TypedResult<CompletionSpanMetadata['model']> {
  const value = extractAttribute({
    attributes,
    keys: [
      ATTRIBUTES.OPENTELEMETRY.GEN_AI.response.model,
      ATTRIBUTES.LATITUDE.request.model,
      ATTRIBUTES.OPENINFERENCE.llm.modelName,
      ATTRIBUTES.AI_SDK.response.model,
      ATTRIBUTES.AI_SDK.model.id,
    ],
  })
  if (value) return Result.ok(value)
  return Result.error(
    new UnprocessableEntityError('Completion model is required'),
  )
}

const NOT_CONFIGURATIONS = [
  'id',
  'configuration',
  'template',
  'parameters',
  'messages',
]

function extractConfiguration(
  attributes: Record<string, SpanAttribute>,
): TypedResult<CompletionSpanMetadata['configuration']> {
  const extractedConfig = extractAttribute({
    attributes,
    keys: [
      ATTRIBUTES.LATITUDE.request.configuration,
      ATTRIBUTES.OPENINFERENCE.llm.invocationParameters,
      ATTRIBUTES.AI_SDK.settings,
    ],
    serializer: (rawConfig) => {
      try {
        return toCamelCase(
          JSON.parse(rawConfig as string) as Record<string, unknown>,
        )
      } catch (error) {
        return undefined
      }
    },
    validation: (config) => config !== undefined,
  })

  if (extractedConfig) return Result.ok(extractedConfig)

  const configuration: Record<string, unknown> = {}
  for (const key in attributes) {
    if (!key.startsWith(ATTRIBUTES.LATITUDE.request._root)) continue
    if (NOT_CONFIGURATIONS.some((not) => key.endsWith(not))) continue

    const parameter = key.replace(ATTRIBUTES.LATITUDE.request._root + '.', '')
    configuration[parameter] = attributes[key]
  }

  return Result.ok(toCamelCase(configuration))
}

function extractPromptTokens(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<CompletionSpanMetadata>['tokens']['prompt']> {
  const tokens = extractAttribute({
    attributes,
    keys: [
      ATTRIBUTES.LATITUDE.usage.promptTokens,
      ATTRIBUTES.OPENTELEMETRY.GEN_AI.usage.inputTokens,
      ATTRIBUTES.OPENINFERENCE.llm.tokenCount.prompt,
      // OPENLLMETRY does not have a custom attribute for prompt tokens
      ATTRIBUTES.AI_SDK.usage.promptTokens,
    ],
    serializer: Number,
    validation: (value) => !isNaN(value),
  })

  return Result.ok(tokens ?? 0)
}

function extractCachedTokens(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<CompletionSpanMetadata>['tokens']['cached']> {
  // Latitude
  const latitudeTokens = extractAttribute({
    attributes,
    keys: [ATTRIBUTES.LATITUDE.usage.cachedTokens],
    serializer: Number,
    validation: (value) => !isNaN(value),
  })
  if (latitudeTokens) return Result.ok(latitudeTokens)

  // OpenTelemetry
  // OpenTelemetry does not have a custom attribute for cached tokens

  // OpenInference
  const openInferenceTokens = extractAllAttributes({
    attributes,
    keys: [
      ATTRIBUTES.OPENINFERENCE.llm.tokenCount.promptDetails.cacheInput,
      ATTRIBUTES.OPENINFERENCE.llm.tokenCount.promptDetails.cacheRead,
      ATTRIBUTES.OPENINFERENCE.llm.tokenCount.promptDetails.cacheWrite,
    ],
    serializer: Number,
    validation: (value) => !isNaN(value),
  })
  if (openInferenceTokens.length > 0) {
    return Result.ok(openInferenceTokens.reduce((acc, value) => acc + value, 0))
  }

  // OpenLLMetry
  const openllmetryTokens = extractAllAttributes({
    attributes,
    keys: [
      ATTRIBUTES.OPENLLMETRY.usage.cacheCreationInputTokens,
      ATTRIBUTES.OPENLLMETRY.usage.cacheReadInputTokens,
    ],
    serializer: Number,
    validation: (value) => !isNaN(value),
  })
  if (openllmetryTokens.length > 0) {
    return Result.ok(openllmetryTokens.reduce((acc, value) => acc + value, 0))
  }

  // Vercel AI SDK
  // Vercel AI SDK does not have a custom attribute for cached tokens

  return Result.ok(0)
}

function extractReasoningTokens(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<CompletionSpanMetadata>['tokens']['reasoning']> {
  const tokens = extractAttribute({
    attributes,
    keys: [
      ATTRIBUTES.LATITUDE.usage.reasoningTokens,
      ATTRIBUTES.OPENINFERENCE.llm.tokenCount.completionDetails.reasoning,
    ],
    serializer: Number,
    validation: (value) => !isNaN(value),
  })
  return Result.ok(tokens ?? 0)
}

function extractCompletionTokens(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<CompletionSpanMetadata>['tokens']['completion']> {
  const tokens = extractAttribute({
    attributes,
    keys: [
      ATTRIBUTES.LATITUDE.usage.completionTokens,
      ATTRIBUTES.OPENTELEMETRY.GEN_AI.usage.outputTokens,
      ATTRIBUTES.OPENINFERENCE.llm.tokenCount.completion,
      // OpenLLMetry does not have a custom attribute for completion tokens
      ATTRIBUTES.AI_SDK.usage.completionTokens,
    ],
    serializer: Number,
    validation: (value) => !isNaN(value),
  })
  return Result.ok(tokens ?? 0)
}

async function enrichCost(
  provider: CompletionSpanMetadata['provider'],
  model: CompletionSpanMetadata['model'],
  tokens: Required<CompletionSpanMetadata>['tokens'],
  workspace: Workspace,
  db = database,
): Promise<TypedResult<Required<CompletionSpanMetadata>['cost']>> {
  const inputTokens = tokens.prompt + tokens.cached
  const outputTokens = tokens.reasoning + tokens.completion

  const repository = new ProviderApiKeysRepository(workspace.id, db)
  const finding = await repository.findByName(provider)

  const totalTokens =
    inputTokens + outputTokens + tokens.reasoning + tokens.cached
  const estimatedCost = estimateCost({
    usage: {
      inputTokens,
      outputTokens,
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens,
      reasoningTokens: tokens.reasoning,
      cachedInputTokens: tokens.cached,
    },
    provider: finding.value?.provider ?? (provider as Providers),
    model: model,
  })

  const cost = Math.ceil(estimatedCost * 100_000)

  return Result.ok(cost)
}

const FINISH_REASON_STOP = toCamelCase(GEN_AI_RESPONSE_FINISH_REASON_VALUE_STOP) // prettier-ignore
const FINISH_REASON_LENGTH = toCamelCase(GEN_AI_RESPONSE_FINISH_REASON_VALUE_LENGTH) // prettier-ignore
const FINISH_REASON_CONTENT_FILTER = toCamelCase(GEN_AI_RESPONSE_FINISH_REASON_VALUE_CONTENT_FILTER) // prettier-ignore
const FINISH_REASON_TOOL_CALLS = toCamelCase(GEN_AI_RESPONSE_FINISH_REASON_VALUE_TOOL_CALLS) // prettier-ignore
const FINISH_REASON_ERROR = toCamelCase(GEN_AI_RESPONSE_FINISH_REASON_VALUE_ERROR) // prettier-ignore
const FINISH_REASON_OTHER = toCamelCase(GEN_AI_RESPONSE_FINISH_REASON_VALUE_OTHER) // prettier-ignore
const FINISH_REASON_UNKNOWN = toCamelCase(GEN_AI_RESPONSE_FINISH_REASON_VALUE_UNKNOWN) // prettier-ignore

function extractFinishReason(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<CompletionSpanMetadata>['finishReason']> {
  const finishReason = extractAttribute({
    attributes,
    keys: [
      ATTRIBUTES.OPENTELEMETRY.GEN_AI.response.finishReasons, // Array of finish reasons, take first
      ATTRIBUTES.OPENLLMETRY.llm.response.finishReason,
      ATTRIBUTES.OPENLLMETRY.llm.response.stopReason,
      ATTRIBUTES.AI_SDK.response.finishReason,
    ],
    serializer: (value: unknown) => {
      if (Array.isArray(value)) {
        // If array, take first value
        if (value.length === 0) return undefined
        return String(value[0])
      }
      return String(value)
    },
    validation: (value) => value !== undefined,
  })

  switch (toCamelCase(finishReason ?? '')) {
    case FINISH_REASON_STOP:
      return Result.ok('stop')
    case FINISH_REASON_LENGTH:
      return Result.ok('length')
    case FINISH_REASON_CONTENT_FILTER:
      return Result.ok('content-filter')
    case FINISH_REASON_TOOL_CALLS:
      return Result.ok('tool-calls')
    case FINISH_REASON_ERROR:
      return Result.ok('error')
    case FINISH_REASON_OTHER:
      return Result.ok('other')
    case FINISH_REASON_UNKNOWN:
      return Result.ok('unknown')
  }

  return Result.ok('unknown')
}
