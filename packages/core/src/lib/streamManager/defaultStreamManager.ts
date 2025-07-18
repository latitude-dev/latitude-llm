import { StreamManager, StreamManagerProps } from '.'
import { Message as LegacyMessage } from '@latitude-data/constants/legacyCompiler'
import { Output, streamAIResponse } from './step/streamAIResponse'
import { resolveToolsFromConfig } from './resolveTools'
import { ValidatedChainStep } from '../../services/chains/ChainValidator'
import { ProviderApiKey } from '../../browser'
import { JSONSchema7 } from 'json-schema'

/**
 * DefaultStreamManager implements a simple single-step streaming strategy.
 *
 * Key differences from other managers like ChainStreamManager:
 * - Handles a single LLM request/response cycle rather than multi-step chains
 * - Completes the chain after one step execution (calls endChain() after step)
 * - Uses a single provider configuration passed directly to the constructor
 * - Has a simpler implementation of step() without recursion
 * - Configuration is fixed at instantiation rather than generated dynamically
 */
export class DefaultStreamManager
  extends StreamManager
  implements StreamManager
{
  private config: ValidatedChainStep['config']
  private provider: ProviderApiKey
  private output: Output
  private schema: JSONSchema7

  constructor({
    config,
    provider,
    output,
    schema,
    ...rest
  }: Omit<StreamManagerProps, 'messages'> & {
    config: ValidatedChainStep['config']
    provider: ProviderApiKey
    output: Output
    schema: JSONSchema7
    messages: LegacyMessage[]
  }) {
    super(rest)

    this.config = config
    this.provider = provider
    this.output = output
    this.schema = schema
  }

  async step(): Promise<void> {
    const toolsBySourceResult = await this.getToolsBySource()
    if (toolsBySourceResult.error) {
      this.endWithError(toolsBySourceResult.error)
      return
    }

    this.startStep()

    const toolsBySource = toolsBySourceResult.unwrap()
    const config = this.transformPromptlToVercelToolDeclarations(
      this.config,
      toolsBySource,
    )

    this.startProviderStep(config)

    try {
      const { response, messages, tokenUsage, finishReason } =
        await streamAIResponse({
          config,
          context: this.$context,
          abortSignal: this.abortSignal,
          controller: this.controller!,
          documentLogUuid: this.uuid,
          messages: this.messages,
          output: this.output,
          provider: this.provider,
          schema: this.schema,
          source: this.source,
          workspace: this.workspace,
        })

      this.updateStateFromResponse({
        response,
        messages,
        tokenUsage,
        finishReason: await finishReason,
      })
      this.endProviderStep({
        tokenUsage,
        response,
        finishReason: await finishReason,
      })
      this.endStep()
      this.endStream()

      return
    } catch (e) {
      this.endWithError(e as Error)
      return
    }
  }

  private getToolsBySource() {
    return resolveToolsFromConfig({
      config: this.config,
      streamManager: this,
    })
  }
}
