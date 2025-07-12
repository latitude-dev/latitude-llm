import { streamAIResponse } from './step/streamAIResponse'
import { Message as LegacyMessage } from '@latitude-data/constants/legacyCompiler'
import { Chain } from 'promptl-ai'
import {
  renderChain,
  ValidatedChainStep,
} from '../../services/chains/ChainValidator'
import { StreamManager, StreamManagerProps } from '.'
import { resolveToolsFromConfig } from './resolveTools'
import { CachedApiKeys } from '../../services/chains/run'

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
  public mockClientToolResults: boolean

  private chain: Chain

  constructor({
    chain,
    providersMap,
    mockClientToolResults = false,
    ...rest
  }: StreamManagerProps & {
    chain: Chain
    providersMap: CachedApiKeys
    mockClientToolResults?: boolean
  }) {
    super(rest)

    this.chain = chain
    this.providersMap = providersMap
    this.mockClientToolResults = mockClientToolResults
  }

  async step(messages?: LegacyMessage[]): Promise<void> {
    try {
      const step = await renderChain({
        workspace: this.workspace,
        chain: this.chain,
        newMessages: messages,
        providersMap: this.providersMap,
      }).then((r) => r.unwrap())
      if (step.chainCompleted) return this.endStream()

      const toolsBySource = await this.getToolsBySource(step).then((r) =>
        r.unwrap(),
      )
      const config = this.transformPromptlToVercelToolDeclarations(
        step.config,
        toolsBySource,
      )

      this.startStep()
      this.startProviderStep(config)

      const {
        response,
        messages: responseMessages,
        tokenUsage,
        finishReason,
      } = await streamAIResponse({
        config,
        context: this.$context,
        abortSignal: this.abortSignal,
        controller: this.controller!,
        documentLogUuid: this.uuid,
        messages: step.messages,
        output: step.output,
        provider: step.provider,
        schema: step.schema,
        source: this.source,
        workspace: this.workspace,
      })

      this.updateStateFromResponse({
        response,
        messages: responseMessages,
        tokenUsage,
        finishReason: await finishReason,
      })
      this.endProviderStep({
        tokenUsage,
        response,
        finishReason: await finishReason,
      })
      this.endStep()

      return this.step(responseMessages)
    } catch (e) {
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
