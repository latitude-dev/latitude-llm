import { createChain, readMetadata } from '@latitude-data/compiler'

import { Workspace } from '../../browser'
import { LogSources } from '../../constants'
import { Result } from '../../lib'
import { CachedApiKeys, runChain } from '../chains/run'

export async function runPrompt({
  workspace,
  parameters,
  apikeys,
  prompt,
  source,
}: {
  workspace: Workspace
  parameters: Record<string, unknown>
  prompt: string
  apikeys: CachedApiKeys
  source: LogSources
}) {
  let metadata
  try {
    metadata = await readMetadata({
      prompt,
      withParameters: Object.keys(parameters),
    })
  } catch (error) {
    return Result.error(error as Error)
  }

  const chain = createChain({ prompt: metadata.resolvedPrompt, parameters })

  return await runChain({ workspace, chain, apikeys, source })
}
