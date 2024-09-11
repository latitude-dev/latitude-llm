import { createChain } from '@latitude-data/compiler'

import {
  Commit,
  LogSources,
  type DocumentVersion,
  type Workspace,
} from '../../browser'
import { publisher } from '../../events/publisher'
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

  const { stream, response, duration, resolvedContent, documentLogUuid } =
    rezult.value

  return Result.ok({
    stream,
    duration,
    resolvedContent: result.value,
    documentLogUuid,
    response: response.then(async (response) =>
      publisher.publish({
        type: 'documentRun',
        data: {
          workspaceId,
          projectId: commit.projectId,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          documentLogUuid,
          response,
          resolvedContent,
          parameters,
          duration: await duration,
        },
      }),
    ),
  })
}
