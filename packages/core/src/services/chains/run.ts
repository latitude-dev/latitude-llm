import { Chain, MessageRole } from '@latitude-data/compiler'
import { CoreTool, ObjectStreamPart, TextStreamPart } from 'ai'
import { JSONSchema7 } from 'json-schema'
import { v4 } from 'uuid'
import { ZodError } from 'zod'

import { objectToString, ProviderApiKey, Workspace } from '../../browser'
import {
  ChainCallResponse,
  ChainEvent,
  ChainEventTypes,
  ChainObjectResponse,
  ChainStepResponse,
  ChainTextResponse,
  LogSources,
  ProviderData,
  StreamEventTypes,
} from '../../constants'
import { StreamType } from '../../events/handlers'
import { NotFoundError, Result, UnprocessableEntityError } from '../../lib'
import { streamToGenerator } from '../../lib/streamToGenerator'
import { ai, AIReturn, Config, validateConfig } from '../ai'
import { ProviderProcessor } from './ProviderProcessor'

export type CachedApiKeys = Map<string, ProviderApiKey>
type ConfigOverrides =
  | {
      schema: JSONSchema7
      output: 'object' | 'array'
    }
  | { output: 'no-schema' }

export async function runChain({
  workspace,
  chain,
  apikeys,
  source,
  generateUUID = v4,
  configOverrides,
}: {
  workspace: Workspace
  chain: Chain
  generateUUID?: () => string
  source: LogSources
  apikeys: CachedApiKeys
  configOverrides?: ConfigOverrides
}) {
  const documentLogUuid = generateUUID()

  let responseResolve: (value: ChainCallResponse) => void
  let responseReject: (reason?: any) => void

  const response = new Promise<ChainCallResponse>((resolve, reject) => {
    responseResolve = resolve
    responseReject = reject
  })

  const startTime = Date.now()
  const stream = new ReadableStream<ChainEvent>({
    start(controller) {
      iterate({
        workspace,
        source,
        chain,
        apikeys,
        controller,
        documentLogUuid,
        configOverrides,
      })
        .then(responseResolve)
        .catch(responseReject)
    },
  })

  return Result.ok({
    stream,
    response,
    resolvedContent: chain.rawText,
    documentLogUuid,
    duration: response.then(() => Date.now() - startTime),
  })
}

async function iterate({
  workspace,
  source,
  chain,
  previousApiKey,
  apikeys,
  controller,
  previousCount = 0,
  previousResponse,
  documentLogUuid,
  configOverrides,
}: {
  workspace: Workspace
  source: LogSources
  chain: Chain
  apikeys: CachedApiKeys
  controller: ReadableStreamDefaultController
  previousCount?: number
  previousApiKey?: ProviderApiKey
  documentLogUuid: string
  previousResponse?: ChainTextResponse
  configOverrides?: ConfigOverrides
}) {
  try {
    const step = await computeStepData({
      chain,
      previousResponse,
      apikeys,
      apiKey: previousApiKey,
      sentCount: previousCount,
    })

    publishStepStartEvent(controller, step, documentLogUuid)

    const providerProcessor = new ProviderProcessor({
      source,
      documentLogUuid,
      config: step.config,
      apiProvider: step.apiKey,
      messages: step.conversation.messages,
    })
    const aiResult = await ai({
      workspace,
      messages: step.conversation.messages,
      config: step.config,
      provider: step.apiKey,
      schema: getSchemaForAI(step, configOverrides),
      output: getOutputForAI(step, configOverrides),
    })

    await streamAIResult(controller, aiResult)
    const response = await providerProcessor.call({
      aiResult,
      saveSyncProviderLogs: step.completed,
    })

    if (step.completed) {
      await handleCompletedChain(
        controller,
        step,
        response as ChainCallResponse,
      )
      return response as ChainCallResponse
    } else {
      publishStepCompleteEvent(controller, response as ChainStepResponse)

      return iterate({
        workspace,
        source,
        chain,
        documentLogUuid,
        apikeys,
        controller,
        previousApiKey: step.apiKey,
        previousCount: step.sentCount,
        previousResponse: response as ChainTextResponse,
        configOverrides,
      })
    }
  } catch (error) {
    handleIterationError(controller, error)
    throw error
  }
}

function getSchemaForAI(
  step: Awaited<ReturnType<typeof computeStepData>>,
  configOverrides?: ConfigOverrides,
) {
  return step.completed
    ? // @ts-expect-error - schema does not exist in some types of configOverrides which is fine
      configOverrides?.schema || step.config.schema
    : undefined
}

function getOutputForAI(
  step: Awaited<ReturnType<typeof computeStepData>>,
  configOverrides?: ConfigOverrides,
) {
  return step.completed
    ? configOverrides?.output || step.config.schema?.type || 'no-schema'
    : undefined
}

function publishStepStartEvent(
  controller: ReadableStreamDefaultController,
  stepResult: Awaited<ReturnType<typeof computeStepData>>,
  documentLogUuid?: string,
) {
  enqueueChainEvent(controller, {
    data: {
      type: ChainEventTypes.Step,
      isLastStep: stepResult.completed,
      config: stepResult.conversation.config as Config,
      messages: stepResult.newMessagesInStep,
      documentLogUuid,
    },
    event: StreamEventTypes.Latitude,
  })
}

async function streamAIResult(
  controller: ReadableStreamDefaultController,
  result: Awaited<AIReturn<StreamType>>,
) {
  for await (const value of streamToGenerator<
    TextStreamPart<Record<string, CoreTool>> | ObjectStreamPart<unknown>
  >(result.data.fullStream)) {
    enqueueChainEvent(controller, {
      event: StreamEventTypes.Provider,
      data: value as unknown as ProviderData,
    })
  }
}

async function handleCompletedChain(
  controller: ReadableStreamDefaultController,
  stepResult: Awaited<ReturnType<typeof computeStepData>>,
  response: ChainCallResponse,
) {
  const eventData = {
    type: ChainEventTypes.Complete,
    config: stepResult.conversation.config as Config,
    documentLogUuid: response.documentLogUuid,
    response,
  } as const

  if ('text' in response) {
    Object.assign(eventData, {
      messages: [
        {
          role: MessageRole.assistant,
          toolCalls: (response as ChainTextResponse).toolCalls || [],
          content: response.text || '',
        },
      ],
    })
  } else if ('object' in response) {
    Object.assign(eventData, {
      object: (response as ChainObjectResponse).object,
      text: objectToString((response as ChainObjectResponse).object),
    })
  }

  enqueueChainEvent(controller, {
    event: StreamEventTypes.Latitude,
    data: eventData,
  })

  controller.close()
}

function publishStepCompleteEvent(
  controller: ReadableStreamDefaultController,
  response: ChainStepResponse,
) {
  enqueueChainEvent(controller, {
    event: StreamEventTypes.Latitude,
    data: {
      type: ChainEventTypes.StepComplete,
      documentLogUuid: response.documentLogUuid,
      response: response,
    },
  })
}

function handleIterationError(
  controller: ReadableStreamDefaultController,
  error: unknown,
) {
  // TODO: Capture all these errors in the errors table
  const chainError =
    error instanceof Error ? error : new Error('An unknown error occurred')

  enqueueChainEvent(controller, {
    event: StreamEventTypes.Latitude,
    data: {
      type: ChainEventTypes.Error,
      error: {
        name: chainError.name,
        message: chainError.message,
        stack: chainError.stack,
      },
    },
  })
  controller.close()

  if (error instanceof ZodError) {
    throw new UnprocessableEntityError(
      'Error validating document configuration',
      error.formErrors.fieldErrors,
    )
  }
}

/**
 *  Performs some common operations needed for processing an iteration step
 **/
async function computeStepData({
  chain,
  apikeys,
  previousResponse,
  apiKey,
  sentCount,
}: {
  chain: Chain
  apikeys: CachedApiKeys
  previousResponse?: ChainTextResponse
  apiKey?: ProviderApiKey
  sentCount: number
}) {
  const { completed, conversation } = await chain.step(previousResponse?.text)
  const config = validateConfig(conversation.config)
  apiKey = await findApiKey({ apikeys, name: config.provider })

  const newMessagesInStep = conversation.messages.slice(sentCount)
  sentCount += newMessagesInStep.length

  return {
    sentCount,
    apiKey,
    conversation,
    completed,
    config,
    newMessagesInStep,
  }
}

async function findApiKey({
  apikeys,
  name,
}: {
  apikeys: CachedApiKeys
  name: string
}) {
  const apiKey = apikeys.get(name)
  if (!apiKey) {
    throw new NotFoundError(
      `Provider API Key with Id ${name} not found. Did you forget to add it to the workspace?`,
    )
  }

  return apiKey
}

export function enqueueChainEvent(
  controller: ReadableStreamDefaultController,
  event: ChainEvent,
) {
  controller.enqueue(event)
}
