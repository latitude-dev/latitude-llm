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
import { Result } from '../../lib'
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
}: {
  workspace: Workspace
  parameters: Record<string, unknown>
  prompt: string
  promptlVersion: number
  providersMap: CachedApiKeys
  source: LogSources
  promptSource: PromptSource
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
    globalConfig: metadata.config as PromptConfig,
    persistErrors: false,
    promptSource,
  })
  return Result.ok(run)
}
