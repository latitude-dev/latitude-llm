import {
  createChain,
  ConversationMetadata as LegacyMetadata,
  Chain as LegacyChain,
  readMetadata,
} from '@latitude-data/compiler'
import {
  ConversationMetadata as PromptlMetadata,
  Chain as PromptlChain,
  scan,
} from 'promptl-ai'

import { Workspace } from '../../browser'
import { LogSources, PromptSource } from '../../constants'
import { Result } from '../../lib/Result'
import { CachedApiKeys, runChain } from '../chains/run'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'

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
  let chain: PromptlChain | LegacyChain
  let metadata: LegacyMetadata | PromptlMetadata
  if (promptlVersion === 0) {
    try {
      metadata = await readMetadata({
        prompt,
      })
    } catch (error) {
      return Result.error(error as Error)
    }

    chain = createChain({
      prompt: metadata.resolvedPrompt,
      parameters,
      includeSourceMap: true,
    })
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
    globalConfig: metadata.config as LatitudePromptConfig,
    persistErrors: false,
    promptSource,
    abortSignal,
  })
  return Result.ok(run)
}
