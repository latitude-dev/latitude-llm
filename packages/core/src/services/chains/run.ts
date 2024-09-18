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
  ChainTextResponse,
  LogSources,
  ProviderData,
  StreamEventTypes,
} from '../../constants'
import { NotFoundError, Result, UnprocessableEntityError } from '../../lib'
import { streamToGenerator } from '../../lib/streamToGenerator'
import { ai, Config, validateConfig } from '../ai'

export type CachedApiKeys = Map<string, ProviderApiKey>

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
  configOverrides?: {
    schema: JSONSchema7
    output: 'object' | 'array' | 'no-schema'
  }
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
  configOverrides?: {
    schema: JSONSchema7
    output: 'object' | 'array' | 'no-schema'
  }
}) {
  try {
    const stepResult = await computeStepData({
      chain,
      previousResponse,
      apikeys,
      apiKey: previousApiKey,
      sentCount: previousCount,
    })

    publishStepStartEvent(controller, stepResult)

    const aiResult = await ai({
      workspace,
      source,
      documentLogUuid,
      messages: stepResult.conversation.messages,
      config: stepResult.config,
      provider: stepResult.apiKey,
      schema: configOverrides?.schema,
      output: configOverrides?.output,
      transactionalLogs: stepResult.completed,
    })

    await streamAIResult(controller, aiResult)

    const response = await createChainResponse(aiResult, documentLogUuid)

    if (stepResult.completed) {
      await handleCompletedChain(controller, stepResult, response)
      return response
    } else {
      publishStepCompleteEvent(controller, response)

      return iterate({
        workspace,
        source,
        chain,
        documentLogUuid,
        apikeys,
        controller,
        previousApiKey: stepResult.apiKey,
        previousCount: stepResult.sentCount,
        previousResponse: response as ChainTextResponse,
        configOverrides,
      })
    }
  } catch (error) {
    handleIterationError(controller, error)
    throw error
  }
}

// Helper functions

function publishStepStartEvent(
  controller: ReadableStreamDefaultController,
  stepResult: Awaited<ReturnType<typeof computeStepData>>,
) {
  enqueueChainEvent(controller, {
    data: {
      type: ChainEventTypes.Step,
      isLastStep: stepResult.completed,
      config: stepResult.conversation.config as Config,
      messages: stepResult.newMessagesInStep,
    },
    event: StreamEventTypes.Latitude,
  })
}

async function streamAIResult(
  controller: ReadableStreamDefaultController,
  result: Awaited<ReturnType<typeof ai>>,
) {
  for await (const value of streamToGenerator<
    TextStreamPart<Record<string, CoreTool>> | ObjectStreamPart<unknown>
  >(result.fullStream)) {
    enqueueChainEvent(controller, {
      event: StreamEventTypes.Provider,
      data: value as unknown as ProviderData,
    })
  }
}

async function createChainResponse(
  result: Awaited<ReturnType<typeof ai>>,
  documentLogUuid: string,
): Promise<ChainCallResponse> {
  if (result.object) {
    return {
      text: objectToString(await result.object),
      object: await result.object,
      usage: await result.usage,
      documentLogUuid,
    }
  } else {
    return {
      documentLogUuid,
      text: await result.text,
      usage: await result.usage,
      toolCalls: (await result.toolCalls).map((t) => ({
        id: t.toolCallId,
        name: t.toolName,
        arguments: t.args,
      })),
    }
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
  response: ChainCallResponse,
) {
  enqueueChainEvent(controller, {
    event: StreamEventTypes.Latitude,
    data: {
      type: ChainEventTypes.StepComplete,
      response: response,
    },
  })
}

function handleIterationError(
  controller: ReadableStreamDefaultController,
  error: unknown,
) {
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
