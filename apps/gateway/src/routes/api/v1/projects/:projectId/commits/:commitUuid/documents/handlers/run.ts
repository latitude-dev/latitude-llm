import { zValidator } from '@hono/zod-validator'
import {
  LogSources,
  runDocumentAtCommit,
  streamToGenerator,
} from '@latitude-data/core'
import { queues } from '$/jobs'
import { Factory } from 'hono/factory'
import { SSEStreamingApi, streamSSE } from 'hono/streaming'
import { v4 as uuid } from 'uuid'
import { z } from 'zod'

import { getData } from './_shared'

const factory = new Factory()

const runSchema = z.object({
  documentPath: z.string(),
  parameters: z.record(z.any()).optional().default({}),
})

export const runHandler = factory.createHandlers(
  zValidator('json', runSchema),
  async (c) => {
    return streamSSE(c, async (stream) => {
      const startTime = Date.now()
      const providerLogUuids: string[] = []

      const { projectId, commitUuid } = c.req.param()
      const { documentPath, parameters } = c.req.valid('json')

      const workspace = c.get('workspace')
      const apiKey = c.get('apiKey')

      const { document, commit } = await getData({
        workspace,
        projectId: Number(projectId!),
        commitUuid: commitUuid!,
        documentPath: documentPath!,
      })

      const result = await runDocumentAtCommit({
        documentUuid: document.documentUuid,
        commit,
        parameters,
        logHandler: (log) => {
          queues.defaultQueue.jobs.enqueueCreateProviderLogJob({
            ...log,
            source: LogSources.API,
            apiKeyId: apiKey.id,
          })

          providerLogUuids.push(log.uuid)
        },
      }).then((r) => r.unwrap())

      // TODO: This job is created assuming that the previous providerLog have all already been created. If not, they will not be correctly assigned to the documentLog.
      queues.defaultQueue.jobs.enqueueCreateDocumentLogJob({
        workspace,
        uuid: uuid(),
        documentUuid: document.documentUuid,
        commit,
        resolvedContent: result.resolvedContent,
        parameters,
        duration: Date.now() - startTime,
        providerLogUuids,
      })

      await pipeToStream(stream, result.stream)
    })
  },
)

async function pipeToStream(
  stream: SSEStreamingApi,
  readableStream: ReadableStream,
) {
  let id = 0
  for await (const value of streamToGenerator(readableStream)) {
    stream.write(
      JSON.stringify({
        ...value,
        id: String(id++),
      }),
    )
  }
}
