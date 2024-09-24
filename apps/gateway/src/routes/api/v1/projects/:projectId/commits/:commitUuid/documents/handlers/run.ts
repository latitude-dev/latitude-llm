import { zValidator } from '@hono/zod-validator'
import { LogSources } from '@latitude-data/core/browser'
import { streamToGenerator } from '@latitude-data/core/lib/streamToGenerator'
import { runDocumentAtCommit } from '@latitude-data/core/services/commits/runDocumentAtCommit'
import { captureException } from '$/common/sentry'
import { Factory } from 'hono/factory'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'

import { chainEventPresenter, getData } from './_shared'

const factory = new Factory()

const runSchema = z.object({
  path: z.string(),
  parameters: z.record(z.any()).optional().default({}),
})

export const runHandler = factory.createHandlers(
  zValidator('json', runSchema),
  async (c) => {
    return streamSSE(
      c,
      async (stream) => {
        const { projectId, commitUuid } = c.req.param()
        const { path, parameters } = c.req.valid('json')
        const workspace = c.get('workspace')
        const { document, commit } = await getData({
          workspace,
          projectId: Number(projectId!),
          commitUuid: commitUuid!,
          documentPath: path!,
        }).then((r) => r.unwrap())
        const result = await runDocumentAtCommit({
          workspace,
          document,
          commit,
          parameters,
          source: LogSources.API,
        }).then((r) => r.unwrap())

        let id = 0
        for await (const event of streamToGenerator(result.stream)) {
          const data = chainEventPresenter(event)

          stream.writeSSE({
            id: String(id++),
            event: event.event,
            data: typeof data === 'string' ? data : JSON.stringify(data),
          })
        }
      },
      (error: Error) => {
        captureException(error)

        return Promise.resolve()
      },
    )
  },
)
