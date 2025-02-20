import {
  createChain,
  Chain as LegacyChain,
  readMetadata,
} from '@latitude-data/compiler'
import { Chain as PromptlChain } from 'promptl-ai'

import { Workspace } from '../../browser'
import { LogSources, PromptSource } from '../../constants'
import { Result } from '../../lib'
import { CachedApiKeys, runChain } from '../chains/run'

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
  if (promptlVersion === 0) {
    let metadata
    try {
      metadata = await readMetadata({
        prompt,
        withParameters: Object.keys(parameters),
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
    chain = new PromptlChain({
      prompt,
      parameters,
      includeSourceMap: true,
    })
  }

  const run = await runChain({
    workspace,
    chain,
    promptlVersion,
    providersMap,
    source,
    persistErrors: false,
    promptSource,
  })
  return Result.ok(run)
}
