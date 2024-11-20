import { zValidator } from '@hono/zod-validator'
import { LogSources, messagesSchema } from '@latitude-data/core/browser'
import { generateUUIDIdentifier } from '@latitude-data/core/lib/generateUUID'
import { hashContent } from '@latitude-data/core/lib/hashContent'
import { createDocumentLog } from '@latitude-data/core/services/documentLogs/create'
import { getData } from '$/routes/api/v1/projects/[projectId]/versions/[versionUuid]/documents/handlers/_shared'
import { Factory } from 'hono/factory'
import { z } from 'zod'

const factory = new Factory()

const schema = z.object({
  path: z.string(),
  messages: messagesSchema,
  response: z.string().optional(),
})

export const postHandler = factory.createHandlers(
  zValidator('json', schema),
  async (c) => {
    const { projectId, versionUuid } = c.req.param()
    const { path, messages, response } = c.req.valid('json')
    const workspace = c.get('workspace')
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
        originalPrompt: document.content,
        contentHash: document.contentHash ?? hashContent(document.content),
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

    return c.json(documentLog)
  },
)
