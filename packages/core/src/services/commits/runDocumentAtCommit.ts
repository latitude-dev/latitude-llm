import { createChain } from '@latitude-data/compiler'

import {
  Commit,
  ErrorableEntity,
  LogSources,
  type DocumentVersion,
  type Workspace,
} from '../../browser'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib'
import { runChain } from '../chains/run'
import { createDocumentLog } from '../documentLogs'
import { getResolvedContent } from '../documents'
import { buildProvidersMap } from '../providerApiKeys/buildMap'

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
  const providersMap = await buildProvidersMap({
    workspaceId: workspace.id,
  })
  const result = await getResolvedContent({
    workspaceId: workspace.id,
    document,
    commit,
  })

  if (result.error) return result

  const chain = createChain({ prompt: result.value, parameters })

  const run = await runChain({
    errorableType: ErrorableEntity.DocumentLog,
    workspace,
    chain,
    providersMap,
    source,
  })
  const { stream, response, duration, resolvedContent, errorableUuid } = run

  return Result.ok({
    stream,
    duration,
    resolvedContent: result.value,
    documentLogUuid: errorableUuid,
    response: response.then(async (response) => {
      publisher.publishLater({
        type: 'documentRun',
        data: {
          workspaceId: workspace.id,
          projectId: commit.projectId,
          documentUuid: document.documentUuid,
          commitUuid: commit.uuid,
          documentLogUuid: errorableUuid,
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
          uuid: errorableUuid,
          source,
        },
      }).then((r) => r.unwrap())
    }),
  })
}
