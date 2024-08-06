import { zValidator } from '@hono/zod-validator'
import {
  ChainEvent,
  ChainEventTypes,
  LATITUDE_EVENT,
  runDocumentAtCommit,
  streamToGenerator,
} from '@latitude-data/core'
import { queues } from '$/jobs'
import { Factory } from 'hono/factory'
import { SSEStreamingApi, streamSSE } from 'hono/streaming'
import { z } from 'zod'

import { getData } from './_shared'

const factory = new Factory()

const runSchema = z.object({
  documentPath: z.string(),
  parameters: z.record(z.any()).optional().default({}),
})

export const runHandler = factory.createHandlers(
  zValidator('json', runSchema),
  (c) => {
    return streamSSE(
      c,
      async (stream) => {
        const { projectId, commitUuid } = c.req.param()
        const { documentPath, parameters } = c.req.valid('json')

        const workspace = c.get('workspace')

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
        }).then((r) => r.unwrap())

        await pipeToStream(stream, result.stream)
      },
      async (error, stream) => {
        await stream.write(
          JSON.stringify({
            event: LATITUDE_EVENT,
            data: {
              type: ChainEventTypes.Error,
              error,
            },
          }),
        )

        stream.close()
      },
    )
  },
)

async function pipeToStream(
  stream: SSEStreamingApi,
  readableStream: ReadableStream,
) {
  let id = 0
  for await (const value of streamToGenerator(readableStream)) {
    updateProviderApiKey(value)

    stream.write(
      JSON.stringify({
        ...value,
        id: String(id++),
      }),
    )
  }
}

function updateProviderApiKey(value: ChainEvent) {
  const { event, data } = value
  if (event === LATITUDE_EVENT && data.type === ChainEventTypes.StepComplete) {
    queues.defaultQueue.jobs.enqueueUpdateApiKeyProviderJob({
      providerApiKey: data.providerApiKey!,
      lastUsedAt: new Date().toISOString(),
    })
  }
}
