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
import { buildMessagesFromResponse } from '../../helpers'

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
    const step = await renderChain({
      workspace: this.workspace,
      chain: this.chain,
      newMessages: messages,
      providersMap: this.providersMap,

      // TODO(compiler): add these again
      //configOverrides,
      //removeSchema,
    }).then((r) => r.unwrap())

    // If the chain is completed, no more steps must be ran.
    if (step.chainCompleted) {
      this.endStream()
      return
    }

    // TODO(compiler): bring back this
    //const validStepCount = assertValidStepCount({ stepCount, chain, step })
    //if (validStepCount.error) {
    //  chainStreamManager.error(validStepCount.error)
    //  return step.conversation
    //}

    const toolsBySourceResult = await this.getToolsBySource(step)
    if (toolsBySourceResult.error) {
      this.endWithError(toolsBySourceResult.error)
      return
    }

    const toolsBySource = toolsBySourceResult.unwrap()
    const config = this.transformPromptlToVercelToolDeclarations(
      step.config,
      toolsBySource,
    )

    this.startStep()
    this.startProviderStep(config)

    try {
      // TODO(compiler): return a Result rather than throwing an error
      const { response, tokenUsage, finishReason } = await streamAIResponse({
        config,
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

      await this.updateStateFromResponse({ response, tokenUsage, finishReason })
      await this.completeProviderStep({ tokenUsage, response, finishReason })
      this.completeStep()

      return this.step(buildMessagesFromResponse({ response }))
    } catch (e) {
      this.endWithError(e as Error)
      return
    }
  }

  protected getToolsBySource(step: ValidatedChainStep) {
    return resolveToolsFromConfig({
      workspace: this.workspace,
      promptSource: this.promptSource,
      config: step.config,
      streamManager: this,
    })
  }
}
