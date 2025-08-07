import { Conversation } from '@latitude-data/compiler'
import { ChainEventTypes } from '@latitude-data/constants'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { TraceContext } from '../../../browser'
import { ErrorableEntity } from '../../../constants'
import { ChainStreamManager } from '../../../__deprecated/lib/chainStreamManager'
import { generateUUIDIdentifier } from '../../../lib/generateUUID'
import { deleteCachedChain } from '../chains/chainCache'
import { runChain, RunChainArgs, SomeChain } from '../chains/run'
import { runAgentStep } from './runStep'

export function runAgent<T extends boolean, C extends SomeChain>({
  context,
  workspace,
  providersMap,
  source,
  promptlVersion,
  chain,
  globalConfig,
  persistErrors = true,
  generateUUID = generateUUIDIdentifier,
  errorableType,
  messages: pausedMessages,
  newMessages,
  pausedTokenUsage,
  configOverrides,
  promptSource,
  abortSignal,
  isChain,
}: RunChainArgs<T, C>) {
  const errorableUuid = generateUUID()
  const chainStartTime = Date.now()

  let resolveTrace: (trace: TraceContext) => void
  const trace = new Promise<TraceContext>((resolve) => {
    resolveTrace = resolve
  })

  // Conversation is returned for the Agent to use
  let resolveConversation: (conversation: Conversation) => void
  const conversation = new Promise<Conversation>((resolve) => {
    resolveConversation = resolve
  })

  const chainStreamManager = new ChainStreamManager({
    workspace,
    errorableUuid,
    messages: [...(pausedMessages ?? []), ...(newMessages ?? [])],
    tokenUsage: pausedTokenUsage,
    promptSource,
  })

  let stepCount = 0

  const streamResult = chainStreamManager.start(async () => {
    const chainResult = runChain({
      context,
      workspace,
      providersMap,
      source,
      promptlVersion,
      globalConfig,
      chain,
      persistErrors: persistErrors as true,
      generateUUID,
      errorableType: errorableType as ErrorableEntity,
      messages: pausedMessages,
      newMessages,
      pausedTokenUsage,
      configOverrides,
      removeSchema: true, // Removes the schema configuration for the AI generation, as it is reserved for the agent's Return function
      promptSource,
      abortSignal,
      isChain,
    })

    const chainEventsReader = chainResult.stream.getReader()
    while (true) {
      const { done, value } = await chainEventsReader.read()
      if (done) break

      // Handle chain-finishing events
      if (value.data.type === ChainEventTypes.ChainError) {
        // Serialized error is not a ChainError but at this point
        // we throw the error converted again into a ChainError so the gateway can
        // catch it with all the details
        const streamError = value.data.error as ChainError<RunErrorCodes>
        throw new ChainError({
          message: streamError.message,
          code: streamError.code,
          // @ts-ignore
          details: streamError.details,
        })
      }

      if (value.data.type === ChainEventTypes.ChainCompleted) {
        // Ignore the ChainCompleted event
        continue
      }

      // TODO(compiler): fix types
      // @ts-expect-error - TODO: fix types
      if (value.data.type === ChainEventTypes.ToolsRequested) {
        // Stop the stream and request tools from the user
        // TODO(compiler): fix types
        // @ts-expect-error - TODO: fix types
        chainStreamManager.requestTools(value.data.tools, value.data.trace)
        const conversation = await chainResult.conversation

        // TODO(compiler): fix types
        // @ts-expect-error - TODO: fix types
        resolveTrace(value.data.trace)
        resolveConversation(conversation)
        // TODO(compiler): fix types
        // @ts-expect-error - TODO: fix types
        return { conversation, trace: value.data.trace }
      }

      if (value.data.type === ChainEventTypes.ProviderCompleted) {
        chainStreamManager.setLastResponse(value.data.response)
      }

      // Forward all other events
      chainStreamManager.forwardEvent(value)

      if (value.data.type === ChainEventTypes.StepCompleted) {
        stepCount++
        newMessages = undefined // newMessages has been used by the Chain, so we no longer need it for the agent workflow
      }
    }

    const conversation = {
      config: (await chainResult.conversation).config,
      messages: await chainResult.messages,
    }

    await deleteCachedChain({ workspace, documentLogUuid: errorableUuid })
    const result = await runAgentStep({
      context,
      chainStreamManager,
      workspace,
      source,
      conversation,
      globalConfig,
      providersMap,
      errorableUuid,
      stepCount,
      newMessages,
      previousConfig: conversation.config,
    })

    resolveConversation(result.conversation)
    resolveTrace(result.trace)

    return result
  }, abortSignal)

  return {
    ...streamResult,
    resolvedContent: chain.rawText,
    errorableUuid,
    duration: streamResult.messages.then(() => Date.now() - chainStartTime),
    conversation,
    trace,
  }
}
