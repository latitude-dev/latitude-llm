import { createChain } from '@latitude-data/compiler'

import {
  Commit,
  LogSources,
  type DocumentVersion,
  type Workspace,
} from '../../browser'
import { Result } from '../../lib'
import { runChain } from '../chains/run'
import { getResolvedContent } from '../documents'
import { buildProviderApikeysMap } from '../providerApiKeys/buildMap'

export async function runDocumentAtCommit({
  workspaceId,
  document,
  parameters,
  commit,
  source,
}: {
  workspaceId: Workspace['id']
  document: DocumentVersion
  parameters: Record<string, unknown>
  commit: Commit
  source: LogSources
}) {
  const apikeys = await buildProviderApikeysMap({ workspaceId })
  const result = await getResolvedContent({
    workspaceId,
    document,
    commit,
  })
  if (result.error) return result
  const chain = createChain({ prompt: result.value, parameters })
  const rezult = await runChain({
    chain,
    apikeys,
    source,
  })

  const { stream, response, documentLogUuid } = rezult.value

  return Result.ok({
    stream,
    response,
    resolvedContent: result.value,
    documentLogUuid,
  })
}
