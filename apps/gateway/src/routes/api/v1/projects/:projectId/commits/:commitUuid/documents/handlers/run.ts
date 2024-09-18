import { zValidator } from '@hono/zod-validator'
import { LogSources } from '@latitude-data/core/browser'
import { runDocumentAtCommit } from '@latitude-data/core/services/commits/runDocumentAtCommit'
import { pipeToStream } from '$/common/pipeToStream'
import { captureException } from '$/common/sentry'
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
    return streamSSE(
      c,
      async (stream) => {
        const { projectId, commitUuid } = c.req.param()
        const { documentPath, parameters, source } = c.req.valid('json')

        const workspace = c.get('workspace')

        const { document, commit } = await getData({
          workspace,
          projectId: Number(projectId!),
          commitUuid: commitUuid!,
          documentPath: documentPath!,
        })

        const result = await runDocumentAtCommit({
          workspace,
          document,
          commit,
          parameters,
          source,
        }).then((r) => r.unwrap())

        await pipeToStream(stream, result.stream)
      },
      (error: Error) => {
        captureException(error)

        return Promise.resolve()
      },
    )
  },
)
