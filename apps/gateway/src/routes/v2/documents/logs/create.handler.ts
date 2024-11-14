import { LogSources } from '@latitude-data/core/browser'
import { generateUUIDIdentifier } from '@latitude-data/core/lib/generateUUID'
import { createDocumentLog } from '@latitude-data/core/services/documentLogs/create'
import { getData } from '$/routes/api/v1/projects/[projectId]/versions/[versionUuid]/documents/handlers/_shared'
import { AppRouteHandler } from '$/openApi/types'
import { CreateLogRoute } from '$/routes/v2/documents/logs/create.route'

// @ts-expect-error: broken types
export const createLogHandler: AppRouteHandler<CreateLogRoute> = async (c) => {
  const workspace = c.get('workspace')
  const { projectId, versionUuid } = c.req.valid('param')
  const { path, messages, response } = c.req.valid('json')
  const { document, commit } = await getData({
    workspace,
    projectId: Number(projectId!),
    commitUuid: versionUuid!,
    documentPath: path!,
  }).then((r) => r.unwrap())

  const documentLog = await createDocumentLog({
    data: {
      uuid: generateUUIDIdentifier(),
      documentUuid: document.documentUuid,
      resolvedContent: document.content,
      source: LogSources.API,
      parameters: {},
      providerLog: {
        messages,
        responseText:
          response ??
          (messages[messages.length - 1].content?.text ||
            messages[messages.length - 1].content),
      },
    },
    commit,
  }).then((r) => r.unwrap())

  return c.json(documentLog, 200)
}
