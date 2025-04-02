import {
  ConversationMetadata as PromptlMetadata,
  Chain as PromptlChain,
  scan,
} from 'promptl-ai'

import { Workspace } from '../../browser'
import { LogSources, PromptSource } from '../../constants'
import { Result } from '../../lib/Result'
import { CachedApiKeys, runChain } from '../chains/run'
import { PromptConfig } from '@latitude-data/constants'

export async function runPrompt({
  workspace,
  parameters,
  providersMap,
  prompt,
  promptlVersion,
  source,
  promptSource,
  abortSignal,
}: {
  workspace: Workspace
  parameters: Record<string, unknown>
  prompt: string
  promptlVersion: number
  providersMap: CachedApiKeys
  source: LogSources
  promptSource: PromptSource
  abortSignal?: AbortSignal
}) {
  let chain: PromptlChain
  let metadata: PromptlMetadata
  if (promptlVersion === 0) {
    return Result.error(
      new Error('Chains with promptl version 0 are not supported anymore'),
    )
  } else {
    metadata = await scan({
      prompt,
    })
    chain = new PromptlChain({
      prompt,
      parameters,
      includeSourceMap: true,
    })
  }

  const run = runChain({
    workspace,
    chain,
    promptlVersion,
    providersMap,
    source,
    globalConfig: metadata.config as PromptConfig,
    persistErrors: false,
    promptSource,
    abortSignal,
  })
  return Result.ok(run)
}
