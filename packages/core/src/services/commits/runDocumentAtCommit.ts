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
import { createDocumentLog } from '../documentLogs'
import { getResolvedContent } from '../documents'
import { buildProviderApikeysMap } from '../providerApiKeys/buildMap'

export async function runDocumentAtCommit({
  workspace,
  document,
  parameters,
  commit,
  source,
}: {
  workspace: Workspace
  document: DocumentVersion
  parameters: Record<string, unknown>
  commit: Commit
  source: LogSources
}) {
  const apikeys = await buildProviderApikeysMap({ workspaceId: workspace.id })
  const result = await getResolvedContent({
    workspaceId: workspace.id,
    document,
    commit,
  })
  if (result.error) return result
  const chain = createChain({ prompt: result.value, parameters })
  const rezult = await runChain({
    workspace,
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
    response: response.then(async (response) => {
      publisher.publishLater({
        type: 'documentRun',
        data: {
          workspaceId: workspace.id,
          projectId: commit.projectId,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          documentLogUuid,
          response,
          resolvedContent,
          parameters,
          duration: await duration,
          source,
        },
      })

      return createDocumentLog({
        commit,
        data: {
          documentUuid: document.documentUuid,
          duration: await duration,
          parameters,
          resolvedContent,
          uuid: documentLogUuid,
          source,
        },
      }).then((r) => r.unwrap())
    }),
  })
}
