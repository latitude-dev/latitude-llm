import {
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_SYSTEM,
} from '@opentelemetry/semantic-conventions/incubating'
import {
  ATTR_AI_MODEL_ID,
  ATTR_AI_MODEL_PROVIDER,
  ATTR_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_LLM_MODEL_NAME,
  ATTR_LLM_PROVIDER,
  ATTR_LLM_SYSTEM,
  CompletionSpanMetadata,
  SPAN_SPECIFICATIONS,
  SpanAttribute,
  SpanStatus,
  SpanType,
} from '../../../browser'
import { database, Database } from '../../../client'
import { UnprocessableEntityError } from '../../../lib/errors'
import { Result, TypedResult } from './../../../lib/Result'
import { SpanProcessArgs, toCamelCase } from './shared'

const specification = SPAN_SPECIFICATIONS[SpanType.Completion]
export const CompletionSpanSpecification = {
  ...specification,
  process: process,
}

async function process(
  { attributes, status }: SpanProcessArgs<SpanType.Completion>,
  _: Database = database,
) {
  const extractingcp = extractProvider(attributes)
  if (extractingcp.error) return Result.error(extractingcp.error)
  const provider = extractingcp.value

  const extractingcm = extractModel(attributes)
  if (extractingcm.error) return Result.error(extractingcm.error)
  const model = extractingcm.value

  const extractingcc = extractConfiguration(attributes)
  if (extractingcc.error) return Result.error(extractingcc.error)
  const configuration = toCamelCase(extractingcc.value)

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

  const enrichingcs = enrichCost(provider, model, tokens)
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
  })
}

function extractProvider(
  attributes: Record<string, SpanAttribute>,
): TypedResult<CompletionSpanMetadata['provider']> {
  let provider = String(attributes[ATTR_GEN_AI_SYSTEM] || '')
  if (!provider) provider = String(attributes[ATTR_LLM_SYSTEM] || '')
  if (!provider) provider = String(attributes[ATTR_LLM_PROVIDER] || '')
  if (!provider) provider = String(attributes[ATTR_AI_MODEL_PROVIDER] || '')
  if (provider) return Result.ok(provider)

  return Result.error(
    new UnprocessableEntityError('Completion provider is required'),
  )
}

function extractModel(
  attributes: Record<string, SpanAttribute>,
): TypedResult<CompletionSpanMetadata['model']> {
  let model = String(attributes[ATTR_GEN_AI_RESPONSE_MODEL] || '')
  if (!model) model = String(attributes[ATTR_GEN_AI_REQUEST_MODEL] || '')
  if (!model) model = String(attributes[ATTR_LLM_MODEL_NAME] || '')
  if (!model) model = String(attributes[ATTR_AI_RESPONSE_MODEL] || '')
  if (!model) model = String(attributes[ATTR_AI_MODEL_ID] || '')
  if (model) return Result.ok(model)

  return Result.error(
    new UnprocessableEntityError('Completion model is required'),
  )
}

function extractConfiguration(
  attributes: Record<string, SpanAttribute>,
): TypedResult<CompletionSpanMetadata['configuration']> {
  return Result.nil()
}

function extractInput(
  attributes: Record<string, SpanAttribute>,
): TypedResult<CompletionSpanMetadata['input']> {
  return Result.nil()
}

function extractOutput(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<CompletionSpanMetadata>['output']> {
  return Result.nil()
}

function extractPromptTokens(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<CompletionSpanMetadata>['tokens']['prompt']> {
  return Result.nil()
}

function extractCachedTokens(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<CompletionSpanMetadata>['tokens']['cached']> {
  return Result.nil()
}

function extractReasoningTokens(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<CompletionSpanMetadata>['tokens']['reasoning']> {
  return Result.nil()
}

function extractCompletionTokens(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<CompletionSpanMetadata>['tokens']['completion']> {
  return Result.nil()
}

function enrichCost(
  provider: CompletionSpanMetadata['provider'],
  model: CompletionSpanMetadata['model'],
  tokens: Required<CompletionSpanMetadata>['tokens'],
): TypedResult<Required<CompletionSpanMetadata>['cost']> {
  return Result.nil()
}

function extractFinishReason(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<CompletionSpanMetadata>['finishReason']> {
  return Result.nil()
}
