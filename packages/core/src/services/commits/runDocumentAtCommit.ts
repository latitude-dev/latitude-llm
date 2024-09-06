import { createChain } from '@latitude-data/compiler'

import {
  Commit,
  LogSources,
  type DocumentVersion,
  type Workspace,
} from '../../browser'
import { jobs } from '../../jobs'
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

  const startTime = Date.now()
  const rezult = await runChain({
    chain,
    apikeys,
    source,
  })

  const { stream, response, documentLogUuid } = rezult.value

  response.then((result) => {
    if (result.error) return result

    // TODO: move to events!
    jobs.queues.defaultQueue.jobs.enqueueCreateDocumentLogJob({
      commit,
      data: {
        uuid: documentLogUuid,
        documentUuid: document.documentUuid,
        resolvedContent: chain.rawText,
        parameters,
        duration: Date.now() - startTime,
      },
    })

    return result
  })

  return Result.ok({
    stream,
    response,
    resolvedContent: result.value,
    documentLogUuid,
  })
}
