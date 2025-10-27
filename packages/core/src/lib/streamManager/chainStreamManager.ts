import { streamAIResponse } from './step/streamAIResponse'
import { Message as LegacyMessage } from '@latitude-data/constants/legacyCompiler'
import { Chain } from 'promptl-ai'
import {
  validateChain,
  ValidatedChainStep,
} from '../../services/chains/ChainValidator'
import { StreamManager, StreamManagerProps } from '.'
import { resolveToolsFromConfig } from './resolveTools'
import { CachedApiKeys } from '../../services/chains/run'
import { isAbortError } from '../isAbortError'
import type { SimulationSettings } from '@latitude-data/constants/simulation'

/**
 * ChainStreamManager extends StreamManager to handle streaming for multi-step AI chains.
 *
 * Key differences from DefaultStreamManager:
 * - Handles sequential steps in a Chain, recursively calling step() to advance through the chain
 * - Manages chain state and context between steps
 * - Renders each step of the chain dynamically before execution
 * - Supports chain completion detection to end streaming when the chain is finished
 * - Uses providers from a providersMap rather than a single provider
 */
export class ChainStreamManager extends StreamManager implements StreamManager {
  public providersMap: CachedApiKeys

  private chain: Chain

  constructor({
    chain,
    providersMap,
    ...rest
  }: StreamManagerProps & {
    chain: Chain
    providersMap: CachedApiKeys
    simulationSettings?: SimulationSettings
  }) {
    super(rest)

    this.chain = chain
    this.providersMap = providersMap
  }

  async step(messages?: LegacyMessage[]): Promise<void> {
    try {
      const chain = await validateChain({
        workspace: this.workspace,
        chain: this.chain,
        newMessages: messages,
        providersMap: this.providersMap,
      }).then((r) => r.unwrap())
      if (chain.chainCompleted) return this.endStream()

      this.setMessages(chain.messages)
      this.startStep()
      this.startProviderStep({
        config: chain.config,
        messages: chain.messages,
        provider: chain.provider,
      })

      const toolsBySource = await this.getToolsBySource(chain).then((r) =>
        r.unwrap(),
      )
      const config = this.transformPromptlToVercelToolDeclarations(
        chain.config,
        toolsBySource,
      )

      const {
        response,
        messages: responseMessages,
        tokenUsage,
        finishReason,
      } = await streamAIResponse({
        config,
        context: this.$completion!.context,
        abortSignal: this.abortSignal,
        controller: this.controller!,
        documentLogUuid: this.uuid,
        messages: chain.messages,
        output: chain.output,
        provider: chain.provider,
        schema: chain.schema,
        source: this.source,
        workspace: this.workspace,
        resolvedTools: toolsBySource,
      })

      this.updateStateFromResponse({
        response,
        messages: responseMessages,
        tokenUsage,
        finishReason,
      })
      this.endProviderStep({
        responseMessages,
        tokenUsage,
        response,
        finishReason,
      })
      this.endStep()

      return this.step(responseMessages)
    } catch (e) {
      // Handle abort errors gracefully - just end without treating as error (stream ended in listener)
      if (isAbortError(e)) return

      this.endWithError(e as Error)
      return
    }
  }

  protected getToolsBySource(step: ValidatedChainStep) {
    return resolveToolsFromConfig({
      config: step.config,
      streamManager: this,
    })
  }
}
