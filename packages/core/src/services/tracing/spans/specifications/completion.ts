import { ATTRIBUTES, Providers } from '@latitude-data/constants'
import { Message } from '@latitude-data/constants/messages'
import { Provider, Translator } from 'rosetta-ai'
import {
  extractAllAttributes,
  extractAttribute,
  VALUES,
} from '../../../../../../constants/src/tracing/attributes'
import { database } from '../../../../client'
import {
  CompletionSpanMetadata,
  SPAN_SPECIFICATIONS,
  SpanAttribute,
  SpanStatus,
  SpanType,
} from '../../../../constants'
import { NotFoundError, UnprocessableEntityError } from '../../../../lib/errors'
import { Result, TypedResult } from '../../../../lib/Result'
import { findProviderApiKeyByName } from '../../../../queries/providerApiKeys/findByName'
import { type Workspace } from '../../../../schema/models/types/Workspace'
import { captureException } from '../../../../utils/datadogCapture'
import { estimateCost } from '../../../ai/estimateCost'
import {
  extractLatitudeReferences,
  setField,
  SpanProcessArgs,
  toCamelCase,
  validateUndefineds,
} from '../shared'

const specification = SPAN_SPECIFICATIONS[SpanType.Completion]
export const CompletionSpanSpecification = {
  ...specification,
  process: process,
}

const translator = new Translator({
  filterEmptyMessages: true,
  providerMetadata: 'passthrough',
})

async function process(
  { attributes, status, workspace }: SpanProcessArgs<SpanType.Completion>,
  db = database,
) {
  const providerResult = extractProvider(attributes)
  if (providerResult.error) return providerResult
  const provider = providerResult.unwrap()

  const modelResult = extractModel(attributes)
  if (modelResult.error) return modelResult
  const model = modelResult.unwrap()

  const configurationResult = extractConfiguration(attributes)
  if (configurationResult.error) return configurationResult
  const configuration = configurationResult.unwrap()

  const inputResult = extractInput(attributes)
  if (inputResult.error) return inputResult
  const input = inputResult.unwrap()

  if (status === SpanStatus.Error) {
    return Result.ok({
      ...extractLatitudeReferences(attributes),
      provider: provider,
      model: model,
      configuration: configuration,
      input: input,
    })
  }

  const outputResult = extractOutput(attributes)
  if (outputResult.error) return outputResult
  const output = outputResult.unwrap()

  const promptTokensResult = extractPromptTokens(attributes)
  if (promptTokensResult.error) return promptTokensResult
  const promptTokens = promptTokensResult.unwrap()

  const cachedTokensResult = extractCachedTokens(attributes)
  if (cachedTokensResult.error) return cachedTokensResult
  const cachedTokens = cachedTokensResult.unwrap()

  const reasoningTokensResult = extractReasoningTokens(attributes)
  if (reasoningTokensResult.error) return reasoningTokensResult
  const reasoningTokens = reasoningTokensResult.unwrap()

  const completionTokensResult = extractCompletionTokens(attributes)
  if (completionTokensResult.error) return completionTokensResult
  const completionTokens = completionTokensResult.unwrap()

  const tokens = {
    prompt: promptTokens,
    cached: cachedTokens,
    reasoning: reasoningTokens,
    completion: completionTokens,
  }

  const finishReasonResult = extractFinishReason(attributes)
  if (finishReasonResult.error) return finishReasonResult
  const finishReason = finishReasonResult.unwrap()

  let cost: Required<CompletionSpanMetadata>['cost'] = 0
  const extractedCostResult = extractCost(attributes)
  if (Result.isOk(extractedCostResult)) {
    cost = extractedCostResult.unwrap()
  } else {
    const enrichedCostResult = await enrichCost(
      provider,
      model,
      tokens,
      workspace,
      db,
    )
    if (enrichedCostResult.error) return enrichedCostResult
    cost = enrichedCostResult.unwrap()
  }

  return Result.ok({
    ...extractLatitudeReferences(attributes),
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
  const value = extractAttribute({
    attributes,
    keys: [
      ATTRIBUTES.OPENTELEMETRY.GEN_AI.provider,
      ATTRIBUTES.OPENTELEMETRY.GEN_AI._deprecated.system,
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
      ATTRIBUTES.OPENINFERENCE.llm.model,
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
  const configObject = extractAttribute({
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
      } catch (_error) {
        return undefined
      }
    },
    validation: (config) => config !== undefined,
  })

  if (configObject) return Result.ok(configObject)

  const configuration: Record<string, unknown> = {}
  for (const attrKey in attributes) {
    if (
      !attrKey.startsWith(ATTRIBUTES.LATITUDE.request._root) &&
      !attrKey.startsWith(ATTRIBUTES.OPENTELEMETRY.GEN_AI.request._root)
    ) {
      continue
    }

    const configKey = attrKey
      .replace(ATTRIBUTES.LATITUDE.request._root + '.', '')
      .replace(ATTRIBUTES.OPENTELEMETRY.GEN_AI.request._root + '.', '')

    if (NOT_CONFIGURATIONS.includes(configKey)) continue
    configuration[configKey] = attributes[attrKey]
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

function extractCost(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<CompletionSpanMetadata>['cost']> {
  const cost = extractAttribute({
    attributes,
    keys: [ATTRIBUTES.OPENINFERENCE.llm.cost.total],
    serializer: Number,
    validation: (value) => !isNaN(value),
  })
  if (!cost) {
    return Result.error(new NotFoundError('Cost has not been found in span'))
  }
  return Result.ok(cost)
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

  let providerKey
  try {
    providerKey = await findProviderApiKeyByName(
      { workspaceId: workspace.id, name: provider },
      db,
    )
  } catch {
    providerKey = undefined
  }

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
    provider: providerKey?.provider ?? (provider as Providers),
    model: model,
  })

  const cost = Math.ceil(estimatedCost * 100_000)

  return Result.ok(cost)
}

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
    case toCamelCase(VALUES.OPENTELEMETRY.GEN_AI.response.finishReasons.stop):
      return Result.ok('stop')
    case toCamelCase(VALUES.OPENTELEMETRY.GEN_AI.response.finishReasons.length):
      return Result.ok('length')
    case toCamelCase(VALUES.OPENTELEMETRY.GEN_AI.response.finishReasons.contentFilter): // prettier-ignore
      return Result.ok('content-filter')
    case toCamelCase(VALUES.OPENTELEMETRY.GEN_AI.response.finishReasons.toolCalls): // prettier-ignore
      return Result.ok('tool-calls')
    case toCamelCase(VALUES.OPENTELEMETRY.GEN_AI.response.finishReasons.error):
      return Result.ok('error')
    case toCamelCase(VALUES.OPENTELEMETRY.GEN_AI.response.finishReasons.other):
      return Result.ok('other')
  }

  return Result.ok('unknown')
}

function extractNested(
  attributes: Record<string, SpanAttribute>,
  key: string,
): TypedResult<Record<string, unknown>[]> {
  let messages: Record<string, unknown>[] = []

  try {
    const attribute = String(attributes[key] ?? '')
    if (attribute) {
      const value = JSON.parse(attribute)
      if (!Array.isArray(value)) {
        return Result.error(
          new UnprocessableEntityError('Invalid nested messages'),
        )
      }
      messages = value
    }
  } catch {
    return Result.error(new UnprocessableEntityError('Invalid nested messages'))
  }

  if (!validateUndefineds(messages)) {
    return Result.error(new UnprocessableEntityError('Invalid nested messages'))
  }

  return Result.ok(messages)
}

function extractFlattened(
  attributes: Record<string, SpanAttribute>,
  prefix: string,
): TypedResult<Record<string, unknown>[]> {
  let messages: Record<string, unknown>[] = []

  try {
    for (const key in attributes) {
      if (!key.startsWith(prefix)) continue
      const field = key.replace(prefix + '.', '')
      setField(messages, field, attributes[key])
    }
  } catch {
    return Result.error(
      new UnprocessableEntityError('Invalid flattened messages'),
    )
  }

  if (!validateUndefineds(messages)) {
    return Result.error(
      new UnprocessableEntityError('Invalid flattened messages'),
    )
  }

  // Unwrap the nested `.message` structure from OpenInference format
  // e.g., { message: { role: "user", content: "..." } } -> { role: "user", content: "..." }
  messages = messages.map((item) => {
    if (
      item &&
      typeof item === 'object' &&
      'message' in item &&
      item.message &&
      typeof item.message === 'object'
    ) {
      return item.message as Record<string, unknown>
    }
    return item
  })

  return Result.ok(messages)
}

export function extractInput(
  attributes: Record<string, SpanAttribute>,
): TypedResult<CompletionSpanMetadata['input']> {
  const messages: Message[] = []

  const system = extractAttribute({
    attributes,
    keys: [
      ATTRIBUTES.OPENTELEMETRY.GEN_AI.systemInstructions,
      ATTRIBUTES.LATITUDE.request.systemPrompt,
    ],
  })
  if (system) {
    try {
      const translating = translator.safeTranslate([], {
        from: Provider.GenAI,
        to: Provider.Promptl,
        direction: 'input',
        system: JSON.parse(system),
      })
      if (translating.error) captureException(translating.error)
      const translated = (translating.messages ?? []) as Message[]

      messages.push(...translated)
    } catch {
      return Result.error(
        new UnprocessableEntityError('Invalid system instructions'),
      )
    }
  }

  for (const /* prettier-ignore */ [ key, structure, provider ] of /* prettier-ignore */ [
    [ATTRIBUTES.OPENTELEMETRY.GEN_AI.input.messages, 'nested', Provider.GenAI],
    [ATTRIBUTES.LATITUDE.request.messages, 'nested', Provider.Promptl],
    [ATTRIBUTES.AI_SDK.prompt.messages, 'nested', Provider.VercelAI],
    [ATTRIBUTES.OPENTELEMETRY.GEN_AI._deprecated.prompt._root, 'flattened', Provider.Compat],
    [ATTRIBUTES.OPENINFERENCE.llm.inputMessages, 'flattened', Provider.Compat],
    [ATTRIBUTES.OPENINFERENCE.llm.prompts, 'flattened', Provider.Compat],
  ] as const) {
    try {
      let payload
      if (structure === 'nested') {
        const extracting = extractNested(attributes, key)
        if (extracting.error) return Result.error(extracting.error)
        payload = extracting.value
      } else if (structure === 'flattened') {
        const extracting = extractFlattened(attributes, key)
        if (extracting.error) return Result.error(extracting.error)
        payload = extracting.value
      } else {
        return Result.error(
          new UnprocessableEntityError('Invalid input messages'),
        )
      }

      if (payload.length < 1) continue

      // Note: we translate GenAI system and messages at the same time
      // to have chance of reordering the system messages correctly
      const translating = translator.safeTranslate(payload, {
        from: provider,
        to: Provider.Promptl,
        direction: 'input',
        system: (provider === Provider.GenAI && system) ? JSON.parse(system) : undefined, // prettier-ignore
      })
      if (translating.error) captureException(translating.error)
      const translated = (translating.messages ?? []) as Message[]

      if (provider === Provider.GenAI) return Result.ok(translated)
      return Result.ok([...messages, ...translated])
    } catch {
      return Result.error(
        new UnprocessableEntityError('Invalid input messages'),
      )
    }
  }

  return Result.ok(messages)
}

export function extractOutput(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<CompletionSpanMetadata>['output']> {
  for (const /* prettier-ignore */ [ key, structure, provider ] of /* prettier-ignore */ [
    [ATTRIBUTES.OPENTELEMETRY.GEN_AI.output.messages, 'nested', Provider.GenAI],
    [ATTRIBUTES.LATITUDE.response.messages, 'nested', Provider.Promptl],
    [ATTRIBUTES.OPENTELEMETRY.GEN_AI._deprecated.completion._root, 'flattened', Provider.Compat],
    [ATTRIBUTES.OPENINFERENCE.llm.outputMessages, 'flattened', Provider.Compat],
    [ATTRIBUTES.OPENINFERENCE.llm.completions, 'flattened', Provider.Compat],
  ] as const) {
    try {
      let payload
      if (structure === 'nested') {
        const extracting = extractNested(attributes, key)
        if (extracting.error) return Result.error(extracting.error)
        payload = extracting.value
      } else if (structure === 'flattened') {
        const extracting = extractFlattened(attributes, key)
        if (extracting.error) return Result.error(extracting.error)
        payload = extracting.value
      } else {
        return Result.error(
          new UnprocessableEntityError('Invalid output messages'),
        )
      }

      if (payload.length < 1) continue

      const translating = translator.safeTranslate(payload, {
        from: provider,
        to: Provider.Promptl,
        direction: 'output',
      })
      if (translating.error) captureException(translating.error)
      const translated = (translating.messages ?? []) as Message[]

      return Result.ok(translated)
    } catch {
      return Result.error(
        new UnprocessableEntityError('Invalid output messages'),
      )
    }
  }

  const responseText = extractAttribute({
    attributes,
    keys: [ATTRIBUTES.AI_SDK.response.text],
  })
  const responseObject = extractAttribute({
    attributes,
    keys: [ATTRIBUTES.AI_SDK.response.object],
  })
  const responseToolCalls = extractAttribute({
    attributes,
    keys: [ATTRIBUTES.AI_SDK.response.toolCalls],
  })
  if (responseText || responseObject || responseToolCalls) {
    const message = {
      role: 'assistant',
      content: [] as Record<string, unknown>[],
    }

    if (responseText) {
      message.content.push({ type: 'text', text: responseText })
    }

    if (responseObject) {
      message.content.push({ type: 'text', text: responseObject })
    }

    if (responseToolCalls) {
      try {
        const toolCalls = JSON.parse(responseToolCalls)
        if (!Array.isArray(toolCalls)) {
          return Result.error(
            new UnprocessableEntityError('Invalid output tool calls'),
          )
        }
        message.content.push(...toolCalls)
      } catch {
        return Result.error(
          new UnprocessableEntityError('Invalid output tool calls'),
        )
      }
    }

    if (message.content.length > 0) {
      try {
        const translating = translator.safeTranslate([message], {
          from: Provider.VercelAI,
          to: Provider.Promptl,
          direction: 'output',
        })
        if (translating.error) captureException(translating.error)
        const translated = (translating.messages ?? []) as Message[]

        return Result.ok(translated)
      } catch {
        return Result.error(
          new UnprocessableEntityError('Invalid output messages'),
        )
      }
    }
  }

  return Result.ok([])
}
