import { LogSources } from '@latitude-data/core/browser'
import { generateUUIDIdentifier } from '@latitude-data/core/lib/generateUUID'
import { createDocumentLog } from '@latitude-data/core/services/documentLogs/create'
import { AppRouteHandler } from '$/openApi/types'
import { CreateLogRoute } from './create.route'
import { getData } from '$/common/documents/getData'

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
  const last = messages[messages.length - 1]
  const content = last ? last.content : undefined
  const documentLog = await createDocumentLog({
    data: {
      uuid: generateUUIDIdentifier(),
      documentUuid: document.documentUuid,
      resolvedContent: document.content,
      source: LogSources.API,
      parameters: {},
      providerLog: {
        // @ts-expect-error: broken types
        messages,
        // @ts-expect-error: content can be an array of elements or objec or a string
        responseText: response ?? (content?.text || content),
      },
    },
    commit,
  }).then((r) => r.unwrap())

  return c.json(documentLog, 200)
}
