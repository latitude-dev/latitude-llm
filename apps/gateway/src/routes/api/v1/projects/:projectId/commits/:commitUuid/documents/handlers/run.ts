import { zValidator } from '@hono/zod-validator'
import { runDocumentAtCommit } from '@latitude-data/core'
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
  async (c) => {
    return streamSSE(c, async (stream) => {
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
    })
  },
)

async function pipeToStream(
  stream: SSEStreamingApi,
  readableStream: ReadableStream,
) {
  let id = 0
  const reader = readableStream.getReader()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    stream.write(
      JSON.stringify({
        ...value,
        id: String(id++),
      }),
    )
  }
}
