import { StreamManager, StreamManagerProps } from '.'
import { Message as LegacyMessage } from '@latitude-data/constants/legacyCompiler'
import { Output, streamAIResponse } from './step/streamAIResponse'
import {
  applyAgentRule,
  ValidatedChainStep,
} from '../../services/chains/ChainValidator'
import { type ProviderApiKey } from '../../schema/models/types/ProviderApiKey'
import { JSONSchema7 } from 'json-schema'
import { isAbortError } from '@ai-sdk/provider-utils'
import { lookupTools } from '../../services/documents/tools/lookup'
import { resolveTools } from '../../services/documents/tools/resolve'
import { DocumentVersionsRepository } from '../../repositories'
import { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { Result } from '../Result'
import { PromisedResult } from '../Transaction'
import { ResolvedToolsDict } from '@latitude-data/constants'
import { LatitudeError } from '../errors'

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
    try {
      this.setMessages(this.messages)
      this.startStep()
      this.startProviderStep({
        config: this.config,
        messages: this.messages,
        provider: this.provider,
      })

      const toolsBySource = await this.getToolsBySource().then((r) =>
        r.unwrap(),
      )
      const config = this.transformPromptlToVercelToolDeclarations(
        applyAgentRule(this.config),
        toolsBySource,
      )

      const { response, messages, tokenUsage, finishReason } =
        await streamAIResponse({
          config,
          context: this.$completion!.context,
          abortSignal: this.abortSignal,
          controller: this.controller!,
          documentLogUuid: this.uuid,
          messages: this.messages,
          output: this.output,
          provider: this.provider,
          schema: this.schema,
          source: this.source,
          workspace: this.workspace,
          resolvedTools: toolsBySource,
        })

      this.updateStateFromResponse({
        response,
        messages,
        tokenUsage,
        finishReason,
      })
      this.endProviderStep({
        responseMessages: messages,
        tokenUsage,
        response,
        finishReason,
      })
      this.endStep()
      this.endStream()

      return
    } catch (e) {
      // Handle abort errors gracefully - just end without treating as error (stream ended in listener)
      if (isAbortError(e)) return

      this.endWithError(e as Error)
      return
    }
  }

  private async getToolsBySource(): PromisedResult<
    ResolvedToolsDict,
    LatitudeError
  > {
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
      config: this.config,
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
