import { zValidator } from '@hono/zod-validator'
import { LogSources } from '@latitude-data/core/browser'
import { runDocumentAtCommit } from '@latitude-data/core/services/commits/runDocumentAtCommit'
import { createProviderLog } from '@latitude-data/core/services/providerLogs/create'
import { pipeToStream } from '$/common/pipeToStream'
import { queues } from '$/jobs'
import { Factory } from 'hono/factory'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'

import { getData } from './_shared'

const factory = new Factory()

const runSchema = z.object({
  documentPath: z.string(),
  parameters: z.record(z.any()).optional().default({}),
  source: z.nativeEnum(LogSources).optional().default(LogSources.API),
})

export const runHandler = factory.createHandlers(
  zValidator('json', runSchema),
  async (c) => {
    return streamSSE(c, async (stream) => {
      const startTime = Date.now()

      const { projectId, commitUuid } = c.req.param()
      const { documentPath, parameters, source } = c.req.valid('json')

      const workspace = c.get('workspace')
      const apiKey = c.get('apiKey')

      const { document, commit, project } = await getData({
        workspace,
        projectId: Number(projectId!),
        commitUuid: commitUuid!,
        documentPath: documentPath!,
      })

      const result = await runDocumentAtCommit({
        workspaceId: project.workspaceId,
        document,
        commit,
        parameters,
        providerLogHandler: (log) => {
          createProviderLog({
            ...log,
            source,
            apiKeyId: apiKey.id,
          }).then((r) => r.unwrap())
        },
      }).then((r) => r.unwrap())

      await pipeToStream(stream, result.stream)

      // TODO: review if this is needed and why it's not in addMessages handler?
      queues.defaultQueue.jobs.enqueueCreateDocumentLogJob({
        commit,
        data: {
          uuid: result.documentLogUuid,
          documentUuid: document.documentUuid,
          resolvedContent: result.resolvedContent,
          parameters,
          duration: Date.now() - startTime,
        },
      })
    })
  },
)
