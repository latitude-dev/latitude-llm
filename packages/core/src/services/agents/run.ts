import { ErrorableEntity } from '../../constants'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import { runChain, SomeChain, RunChainArgs } from '../chains/run'
import { runAgentStep } from './runStep'
import { deleteCachedChain } from '../chains/chainCache'
import { ChainStreamManager } from '../../lib/chainStreamManager'
import { ChainEventTypes } from '@latitude-data/constants'

export function runAgent<T extends boolean, C extends SomeChain>({
  workspace,
  providersMap,
  source,
  promptlVersion,
  chain,

  persistErrors = true,
  generateUUID = generateUUIDIdentifier,
  errorableType,
  messages: pausedMessages,
  newMessages,
  pausedTokenUsage,

  configOverrides,
}: RunChainArgs<T, C>) {
  const errorableUuid = generateUUID()
  const chainStartTime = Date.now()

  const chainStreamManager = new ChainStreamManager({
    errorableUuid,
    messages: pausedMessages,
    tokenUsage: pausedTokenUsage,
  })

  let stepCount = 0

  const streamResult = chainStreamManager.start(async () => {
    const chainResult = runChain({
      workspace,
      providersMap,
      source,
      promptlVersion,
      chain,
      persistErrors: persistErrors as true,
      generateUUID,
      errorableType: errorableType as ErrorableEntity,
      messages: pausedMessages,
      newMessages,
      pausedTokenUsage,
      configOverrides,
      removeSchema: true, // Removes the schema configuration for the AI generation, as it is reserved for the agent's Return function
    })

    const chainEventsReader = chainResult.stream.getReader()
    while (true) {
      const { done, value } = await chainEventsReader.read()
      if (done) break

      // Handle chain-finishing events
      if (value.data.type === ChainEventTypes.ChainError) {
        throw value.data.error
      }
      if (value.data.type === ChainEventTypes.ChainCompleted) {
        // Ignore the ChainCompleted event
        continue
      }
      if (value.data.type === ChainEventTypes.ToolsRequested) {
        // Stop the stream and request tools from the user
        chainStreamManager.requestTools(value.data.tools)
        return
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
    await runAgentStep({
      chainStreamManager,
      workspace,
      source,
      conversation,
      providersMap,
      errorableUuid,
      stepCount,
      newMessages,
    })
  })

  return {
    ...streamResult,
    resolvedContent: chain.rawText,
    errorableUuid,
    duration: streamResult.messages.then(() => Date.now() - chainStartTime),
  }
}
