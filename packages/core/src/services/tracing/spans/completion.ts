import {
  ATTR_LATITUDE_COMMIT_UUID,
  ATTR_LATITUDE_DOCUMENT_UUID,
  ATTR_LATITUDE_EXPERIMENT_UUID,
  Providers,
} from '@latitude-data/constants'
import {
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_SYSTEM,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
} from '@opentelemetry/semantic-conventions/incubating'
import {
  ContentType,
  Message,
  MessageContent,
  MessageRole,
  ToolCallContent,
  ToolMessage,
} from 'promptl-ai'
import { database } from '../../../client'
import {
  ATTR_AI_MODEL_ID,
  ATTR_AI_MODEL_PROVIDER,
  ATTR_AI_PROMPT_MESSAGES,
  ATTR_AI_RESPONSE_FINISH_REASON,
  ATTR_AI_RESPONSE_MODEL,
  ATTR_AI_RESPONSE_OBJECT,
  ATTR_AI_RESPONSE_TEXT,
  ATTR_AI_RESPONSE_TOOL_CALLS,
  ATTR_AI_SETTINGS,
  ATTR_AI_USAGE_COMPLETION_TOKENS,
  ATTR_AI_USAGE_PROMPT_TOKENS,
  ATTR_GEN_AI_COMPLETIONS,
  ATTR_GEN_AI_PROMPTS,
  ATTR_GEN_AI_REQUEST,
  ATTR_GEN_AI_REQUEST_CONFIGURATION,
  ATTR_GEN_AI_REQUEST_MESSAGES,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_SYSTEM_PROMPT,
  ATTR_GEN_AI_RESPONSE_MESSAGES,
  ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHED_TOKENS,
  ATTR_GEN_AI_USAGE_COMPLETION_TOKENS,
  ATTR_GEN_AI_USAGE_PROMPT_TOKENS,
  ATTR_GEN_AI_USAGE_REASONING_TOKENS,
  ATTR_LLM_COMPLETIONS,
  ATTR_LLM_INPUT_MESSAGES,
  ATTR_LLM_INVOCATION_PARAMETERS,
  ATTR_LLM_MODEL_NAME,
  ATTR_LLM_OUTPUT_MESSAGES,
  ATTR_LLM_PROMPTS,
  ATTR_LLM_PROVIDER,
  ATTR_LLM_RESPONSE_FINISH_REASON,
  ATTR_LLM_RESPONSE_STOP_REASON,
  ATTR_LLM_SYSTEM,
  ATTR_LLM_TOKEN_COUNT_COMPLETION,
  ATTR_LLM_TOKEN_COUNT_COMPLETION_DETAILS_REASONING,
  ATTR_LLM_TOKEN_COUNT_PROMPT,
  ATTR_LLM_TOKEN_COUNT_PROMPT_DETAILS_CACHE_INPUT,
  ATTR_LLM_TOKEN_COUNT_PROMPT_DETAILS_CACHE_READ,
  ATTR_LLM_TOKEN_COUNT_PROMPT_DETAILS_CACHE_WRITE,
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
import {
  setField,
  SpanProcessArgs,
  toCamelCase,
  validateUndefineds,
} from './shared'

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
    promptUuid: attributes[ATTR_LATITUDE_DOCUMENT_UUID] as string,
    versionUuid: attributes[ATTR_LATITUDE_COMMIT_UUID] as string,
    experimentUuid: attributes[ATTR_LATITUDE_EXPERIMENT_UUID] as string,
  })
}

function extractProvider(
  attributes: Record<string, SpanAttribute>,
): TypedResult<CompletionSpanMetadata['provider']> {
  let provider = String(attributes[ATTR_GEN_AI_SYSTEM] ?? '')
  if (!provider) provider = String(attributes[ATTR_LLM_SYSTEM] ?? '')
  if (!provider) provider = String(attributes[ATTR_LLM_PROVIDER] ?? '')
  if (!provider) provider = String(attributes[ATTR_AI_MODEL_PROVIDER] ?? '')
  if (provider) return Result.ok(provider)

  return Result.error(
    new UnprocessableEntityError('Completion provider is required'),
  )
}

function extractModel(
  attributes: Record<string, SpanAttribute>,
): TypedResult<CompletionSpanMetadata['model']> {
  let model = String(attributes[ATTR_GEN_AI_RESPONSE_MODEL] ?? '')
  if (!model) model = String(attributes[ATTR_GEN_AI_REQUEST_MODEL] ?? '')
  if (!model) model = String(attributes[ATTR_LLM_MODEL_NAME] ?? '')
  if (!model) model = String(attributes[ATTR_AI_RESPONSE_MODEL] ?? '')
  if (!model) model = String(attributes[ATTR_AI_MODEL_ID] ?? '')
  if (model) return Result.ok(model)

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
  let attribute = String(attributes[ATTR_GEN_AI_REQUEST_CONFIGURATION] ?? '')
  if (!attribute) {
    attribute = String(attributes[ATTR_LLM_INVOCATION_PARAMETERS] ?? '')
  }
  if (!attribute) attribute = String(attributes[ATTR_AI_SETTINGS] ?? '')
  if (attribute) {
    try {
      return Result.ok(
        toCamelCase(JSON.parse(attribute) as Record<string, unknown>),
      )
    } catch (error) {
      return Result.error(
        new UnprocessableEntityError('Invalid completion configuration'),
      )
    }
  }

  const configuration: Record<string, unknown> = {}
  for (const key in attributes) {
    if (!key.startsWith(ATTR_GEN_AI_REQUEST)) continue
    if (NOT_CONFIGURATIONS.some((not) => key.endsWith(not))) continue
    const parameter = key.replace(ATTR_GEN_AI_REQUEST + '.', '')
    configuration[parameter] = attributes[key]
  }

  return Result.ok(toCamelCase(configuration))
}

function convertToolCalls(
  raws: Record<string, unknown>[],
): TypedResult<ToolCallContent[]> {
  const toolCalls: ToolCallContent[] = []

  try {
    for (const raw of raws) {
      const toolCall = toCamelCase(raw)

      if (toolCall.function && typeof toolCall.function === 'object') {
        const func = toolCall.function as Record<string, unknown>
        toolCalls.push({
          type: ContentType.toolCall,
          toolCallId: String(toolCall.id || ''),
          toolName: String(func.name || ''),
          toolArguments: JSON.parse(String(func.arguments || '{}')),
        })
      } else {
        toolCalls.push({
          type: ContentType.toolCall,
          toolCallId: String(toolCall.id || toolCall.toolCallId || toolCall.toolUseId || ''), // prettier-ignore
          toolName: String(toolCall.name || toolCall.toolName || ''),
          toolArguments: JSON.parse(String(toolCall.arguments || toolCall.toolArguments || toolCall.input || '{}')), // prettier-ignore
        })
      }
    }
  } catch {
    return Result.error(
      new UnprocessableEntityError('Invalid completion tool calls'),
    )
  }

  return Result.ok(toolCalls)
}

const CONTENT_TYPE_TEXT = toCamelCase(ContentType.text)
const CONTENT_TYPE_IMAGE = toCamelCase(ContentType.image)
const CONTENT_TYPE_FILE = toCamelCase(ContentType.file)
const CONTENT_TYPE_TOOL_CALL = toCamelCase(ContentType.toolCall)
const CONTENT_TYPE_TOOL_RESULT = toCamelCase('tool-result')

function convertContentType(type: string): TypedResult<ContentType> {
  switch (toCamelCase(type)) {
    case CONTENT_TYPE_TEXT:
      return Result.ok(ContentType.text)
    case CONTENT_TYPE_IMAGE:
      return Result.ok(ContentType.image)
    case CONTENT_TYPE_FILE:
      return Result.ok(ContentType.file)
    case CONTENT_TYPE_TOOL_CALL:
    case 'toolUse':
      return Result.ok(ContentType.toolCall)
    case CONTENT_TYPE_TOOL_RESULT:
      return Result.ok('tool-result' as ContentType)
    default:
      return Result.error(new UnprocessableEntityError('Invalid content type'))
  }
}

function convertMessageContent(
  content: unknown | Record<string, unknown>[],
): TypedResult<MessageContent[]> {
  if (typeof content === 'string') {
    return Result.ok([{ type: ContentType.text, text: content }])
  }

  if (Array.isArray(content)) {
    const result: MessageContent[] = []

    for (const raw of content) {
      const payload = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (!payload || typeof payload !== 'object') {
        return Result.error(
          new UnprocessableEntityError('Invalid message content'),
        )
      }

      const item = toCamelCase(raw as Record<string, unknown>)

      if (!item.type) {
        return Result.error(
          new UnprocessableEntityError('Content type is required'),
        )
      }
      const convertingt = convertContentType(String(item.type))
      if (convertingt.error) return Result.error(convertingt.error)
      const type = convertingt.value

      switch (type) {
        case ContentType.text:
          result.push({
            type: ContentType.text,
            text: String(item.text || ''),
          })
          break
        case ContentType.image:
          result.push({
            type: ContentType.image,
            image: String(item.image || ''),
          })
          break
        case ContentType.file:
          result.push({
            type: ContentType.file,
            file: String(item.file || ''),
            mimeType: String(item.mimeType || ''),
          })
          break
        case ContentType.toolCall:
          {
            const converting = convertToolCalls([item])
            if (converting.error) return Result.error(converting.error)
            result.push(...converting.value)
          }
          break
        case 'tool-result' as ContentType:
          result.push({
            type: 'tool-result',
            toolCallId: String(item.toolId || item.toolCallId || item.toolUseId || ''), // prettier-ignore
            toolName: String(item.toolName || ''),
            result: item.result || {},
            isError: Boolean(item.isError || false),
          } as unknown as MessageContent)
          break
      }
    }

    return Result.ok(result)
  }

  try {
    return Result.ok([
      { type: ContentType.text, text: JSON.stringify(content) },
    ])
  } catch {
    return Result.error(new UnprocessableEntityError('Invalid message content'))
  }
}

const MESSAGE_ROLE_SYSTEM = toCamelCase(MessageRole.system)
const MESSAGE_ROLE_USER = toCamelCase(MessageRole.user)
const MESSAGE_ROLE_ASSISTANT = toCamelCase(MessageRole.assistant)
const MESSAGE_ROLE_DEVELOPER = toCamelCase(MessageRole.developer)
const MESSAGE_ROLE_TOOL = toCamelCase(MessageRole.tool)

function convertMessageRole(role: string): TypedResult<MessageRole> {
  switch (toCamelCase(role)) {
    case MESSAGE_ROLE_SYSTEM:
      return Result.ok(MessageRole.system)
    case MESSAGE_ROLE_USER:
      return Result.ok(MessageRole.user)
    case MESSAGE_ROLE_ASSISTANT:
      return Result.ok(MessageRole.assistant)
    case MESSAGE_ROLE_DEVELOPER:
      return Result.ok(MessageRole.developer)
    case MESSAGE_ROLE_TOOL:
      return Result.ok(MessageRole.tool)
    default:
      return Result.error(new UnprocessableEntityError('Invalid message role'))
  }
}

function convertMessages(
  raws: Record<string, unknown>[],
): TypedResult<Message[]> {
  const messages: Message[] = []

  try {
    for (const raw of raws) {
      const message = toCamelCase(raw)

      if (!message.role) {
        return Result.error(
          new UnprocessableEntityError('Message role is required'),
        )
      }
      const convertingr = convertMessageRole(String(message.role))
      if (convertingr.error) return Result.error(convertingr.error)
      const role = convertingr.value

      if (!message.content && message.content !== '') {
        return Result.error(
          new UnprocessableEntityError('Message content is required'),
        )
      }
      const convertingc = convertMessageContent(message.content)
      if (convertingc.error) return Result.error(convertingc.error)
      const content = convertingc.value

      if (message.toolCalls && Array.isArray(message.toolCalls)) {
        const converting = convertToolCalls(message.toolCalls)
        if (converting.error) return Result.error(converting.error)
        content.push(...converting.value)
      }

      if (role !== MessageRole.tool) {
        messages.push({ role, content } as Message)
      } else {
        const toolName = String(message.toolName || '')
        const toolId = String(message.toolId || message.toolCallId || message.toolUseId || '') // prettier-ignore
        const isError = String(message.isError || '')
        messages.push({ role, content, toolName, toolId, isError } as ToolMessage) // prettier-ignore
      }
    }
  } catch {
    return Result.error(
      new UnprocessableEntityError('Invalid completion messages'),
    )
  }

  return Result.ok(messages)
}

function extractMessages(
  attributes: Record<string, SpanAttribute>,
  prefix: string,
): TypedResult<Message[]> {
  const messages: Record<string, unknown>[] = []

  try {
    for (const key in attributes) {
      if (!key.startsWith(prefix)) continue
      const field = key.replace(prefix + '.', '')
      setField(messages, field, attributes[key])
    }
  } catch {
    return Result.error(
      new UnprocessableEntityError('Invalid completion messages'),
    )
  }

  if (!validateUndefineds(messages)) {
    return Result.error(
      new UnprocessableEntityError('Invalid completion messages'),
    )
  }

  return convertMessages(messages)
}

function extractInput(
  attributes: Record<string, SpanAttribute>,
): TypedResult<CompletionSpanMetadata['input']> {
  const messages: Message[] = []

  const system = String(attributes[ATTR_GEN_AI_REQUEST_SYSTEM_PROMPT] ?? '')
  if (system) {
    messages.push({
      role: MessageRole.system,
      content: [{ type: ContentType.text, text: system }],
    })
  }

  for (const source of [
    ATTR_GEN_AI_REQUEST_MESSAGES,
    ATTR_LLM_INPUT_MESSAGES,
    ATTR_AI_PROMPT_MESSAGES,
  ]) {
    const attribute = String(attributes[source] ?? '')
    if (!attribute) continue
    try {
      const payload = JSON.parse(attribute)
      if (!Array.isArray(payload)) {
        return Result.error(
          new UnprocessableEntityError('Invalid input messages'),
        )
      }

      // Note: messages are already in PromptL format
      if (source === ATTR_GEN_AI_REQUEST_MESSAGES) {
        return Result.ok(payload as Message[])
      }

      const converting = convertMessages(payload)
      if (converting.error) return Result.error(converting.error)
      return Result.ok([...messages, ...converting.value])
    } catch {
      return Result.error(
        new UnprocessableEntityError('Invalid input messages'),
      )
    }
  }

  for (const source of [ATTR_GEN_AI_PROMPTS, ATTR_LLM_PROMPTS]) {
    const extracting = extractMessages(attributes, source)
    if (extracting.error) return Result.error(extracting.error)
    if (extracting.value.length < 1) continue
    return Result.ok([...messages, ...extracting.value])
  }

  return Result.ok(messages)
}

function extractOutput(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<CompletionSpanMetadata>['output']> {
  for (const source of [
    ATTR_GEN_AI_RESPONSE_MESSAGES,
    ATTR_LLM_OUTPUT_MESSAGES,
  ]) {
    const attribute = String(attributes[source] ?? '')
    if (!attribute) continue
    try {
      const payload = JSON.parse(attribute)
      if (!Array.isArray(payload)) {
        return Result.error(
          new UnprocessableEntityError('Invalid output messages'),
        )
      }

      // Note: messages are already in PromptL format
      if (source === ATTR_GEN_AI_RESPONSE_MESSAGES) {
        return Result.ok(payload as Message[])
      }

      const converting = convertMessages(payload)
      if (converting.error) return Result.error(converting.error)
      return Result.ok(converting.value)
    } catch {
      return Result.error(
        new UnprocessableEntityError('Invalid output messages'),
      )
    }
  }

  for (const source of [ATTR_GEN_AI_COMPLETIONS, ATTR_LLM_COMPLETIONS]) {
    const extracting = extractMessages(attributes, source)
    if (extracting.error) return Result.error(extracting.error)
    if (extracting.value.length < 1) continue
    return Result.ok(extracting.value)
  }

  const responseText = String(attributes[ATTR_AI_RESPONSE_TEXT] ?? '')
  const responseObject = String(attributes[ATTR_AI_RESPONSE_OBJECT] ?? '')
  const responseToolCalls = String(attributes[ATTR_AI_RESPONSE_TOOL_CALLS] ?? '') // prettier-ignore
  if (responseText || responseObject || responseToolCalls) {
    const message: Message = { role: MessageRole.assistant, content: [] }

    if (responseText) {
      message.content.push({ type: ContentType.text, text: responseText })
    }

    if (responseObject) {
      message.content.push({ type: ContentType.text, text: responseObject })
    }

    if (responseToolCalls) {
      try {
        const payload = JSON.parse(responseToolCalls)
        if (!Array.isArray(payload)) {
          return Result.error(
            new UnprocessableEntityError('Invalid output tool calls'),
          )
        }

        const converting = convertToolCalls(payload)
        if (converting.error) return Result.error(converting.error)
        message.content.push(...converting.value)
      } catch {
        return Result.error(
          new UnprocessableEntityError('Invalid output tool calls'),
        )
      }
    }

    if (message.content.length > 0) return Result.ok([message])
  }

  return Result.ok([])
}

function extractPromptTokens(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<CompletionSpanMetadata>['tokens']['prompt']> {
  let tokens = Number(attributes[ATTR_GEN_AI_USAGE_PROMPT_TOKENS] ?? NaN)
  if (isNaN(tokens)) {
    tokens = Number(attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS] ?? NaN)
  }
  if (isNaN(tokens)) {
    tokens = Number(attributes[ATTR_LLM_TOKEN_COUNT_PROMPT] ?? NaN)
  }
  if (isNaN(tokens)) {
    tokens = Number(attributes[ATTR_AI_USAGE_PROMPT_TOKENS] ?? NaN)
  }
  if (!isNaN(tokens)) return Result.ok(tokens)

  return Result.ok(0)
}

function extractCachedTokens(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<CompletionSpanMetadata>['tokens']['cached']> {
  let tokens = Number(attributes[ATTR_GEN_AI_USAGE_CACHED_TOKENS] ?? NaN)
  if (isNaN(tokens)) {
    const input = Number(attributes[ATTR_LLM_TOKEN_COUNT_PROMPT_DETAILS_CACHE_INPUT] ?? NaN) // prettier-ignore
    const read = Number(attributes[ATTR_LLM_TOKEN_COUNT_PROMPT_DETAILS_CACHE_READ] ?? NaN) // prettier-ignore
    const write = Number(attributes[ATTR_LLM_TOKEN_COUNT_PROMPT_DETAILS_CACHE_WRITE] ?? NaN) // prettier-ignore
    tokens = input + read + write
  }
  if (isNaN(tokens)) {
    const create = Number(attributes[ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS] ?? NaN) // prettier-ignore
    const read = Number(attributes[ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS] ?? NaN) // prettier-ignore
    tokens = create + read
  }
  if (!isNaN(tokens)) return Result.ok(tokens)

  return Result.ok(0)
}

function extractReasoningTokens(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<CompletionSpanMetadata>['tokens']['reasoning']> {
  let tokens = Number(attributes[ATTR_GEN_AI_USAGE_REASONING_TOKENS] ?? NaN)
  if (isNaN(tokens)) {
    tokens = Number(attributes[ATTR_LLM_TOKEN_COUNT_COMPLETION_DETAILS_REASONING] ?? NaN) // prettier-ignore
  }
  if (!isNaN(tokens)) return Result.ok(tokens)

  return Result.ok(0)
}

function extractCompletionTokens(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<CompletionSpanMetadata>['tokens']['completion']> {
  let tokens = Number(attributes[ATTR_GEN_AI_USAGE_COMPLETION_TOKENS] ?? NaN)
  if (isNaN(tokens)) {
    tokens = Number(attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS] ?? NaN)
  }
  if (isNaN(tokens)) {
    tokens = Number(attributes[ATTR_LLM_TOKEN_COUNT_COMPLETION] ?? NaN)
  }
  if (isNaN(tokens)) {
    tokens = Number(attributes[ATTR_AI_USAGE_COMPLETION_TOKENS] ?? NaN)
  }
  if (!isNaN(tokens)) return Result.ok(tokens)

  return Result.ok(0)
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
  const attribute = attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS] ?? []
  let reason = Array.isArray(attribute) ? (attribute.map(String)[0] ?? '') : String(attribute) // prettier-ignore
  if (!reason) {
    reason = String(attributes[ATTR_LLM_RESPONSE_FINISH_REASON] ?? '')
  }
  if (!reason) {
    reason = String(attributes[ATTR_LLM_RESPONSE_STOP_REASON] ?? '')
  }
  if (!reason) {
    reason = String(attributes[ATTR_AI_RESPONSE_FINISH_REASON] ?? '')
  }
  switch (toCamelCase(reason)) {
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
