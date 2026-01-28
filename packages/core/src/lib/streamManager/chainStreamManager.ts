import { streamAIResponse } from './step/streamAIResponse'
import { Message as LegacyMessage } from '@latitude-data/constants/legacyCompiler'
import { Chain } from 'promptl-ai'
import {
  validateChain,
  ValidatedChainStep,
} from '../../services/chains/ChainValidator'
import { StreamManager, StreamManagerProps } from '.'
import { CachedApiKeys } from '../../services/chains/run'
import { isAbortError } from '../isAbortError'
import type { SimulationSettings } from '@latitude-data/constants/simulation'
import { lookupTools } from '../../services/documents/tools/lookup'
import { DocumentVersionsRepository } from '../../repositories'
import { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { resolveTools } from '../../services/documents/tools/resolve'
import { PromisedResult } from '../Transaction'
import { ResolvedToolsDict } from '@latitude-data/constants'
import { LatitudeError } from '../errors'
import { Result } from '../Result'

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
      await this.startProviderStep({
        provider: chain.provider,
        config: chain.config,
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
        context: this.$context,
        abortSignal: this.abortSignal,
        controller: this.controller!,
        documentLogUuid: this.uuid,
        conversationContext: this.getConversationContext(),
        messages: chain.messages,
        output: chain.output,
        provider: chain.provider,
        schema: chain.schema,
        source: this.source,
        workspace: this.workspace,
        resolvedTools: toolsBySource,
        telemetryOptions: this.telemetryOptions,
      })

      this.updateStateFromResponse({
        response,
        messages: responseMessages,
        tokenUsage,
        finishReason,
      })
      this.endProviderStep({
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

  protected async getToolsBySource(
    step: ValidatedChainStep,
  ): PromisedResult<ResolvedToolsDict, LatitudeError> {
    let documents: DocumentVersion[] = []
    let documentUuid: string = ''

    if ('commit' in this.promptSource) {
      const documentScope = new DocumentVersionsRepository(this.workspace.id)
      const documentsResult = await documentScope.getDocumentsAtCommit(
        this.promptSource.commit,
      )
      if (!Result.isOk(documentsResult)) return documentsResult

      documents = documentsResult.unwrap()
      documentUuid = this.promptSource.document.documentUuid
    }

    const toolsManifestResult = await lookupTools({
      config: step.config,
      documentUuid,
      documents,
      workspace: this.workspace,
    })

    if (toolsManifestResult.error) return toolsManifestResult
    const toolManifestDict = toolsManifestResult.unwrap()

    return resolveTools({
      toolManifestDict,
      streamManager: this,
    })
  }
}
