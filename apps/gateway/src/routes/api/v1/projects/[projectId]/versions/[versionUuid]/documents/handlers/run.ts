import { zValidator } from '@hono/zod-validator'
import { LogSources } from '@latitude-data/core/browser'
import { getUnknownError } from '@latitude-data/core/lib/getUnknownError'
import { streamToGenerator } from '@latitude-data/core/lib/streamToGenerator'
import { runDocumentAtCommit } from '@latitude-data/core/services/commits/runDocumentAtCommit'
import { captureException } from '$/common/sentry'
import { Factory } from 'hono/factory'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'

import {
  chainEventPresenter,
  getData,
  publishDocumentRunRequestedEvent,
} from './_shared'

const factory = new Factory()

const runSchema = z.object({
  path: z.string(),
  customIdentifier: z.string().optional(),
  parameters: z.record(z.any()).optional().default({}),
  __internal: z
    .object({
      source: z.nativeEnum(LogSources).optional(),
    })
    .optional(),
})

export const runHandler = factory.createHandlers(
  zValidator('json', runSchema),
  async (c) => {
    return streamSSE(
      c,
      async (stream) => {
        const { projectId, versionUuid } = c.req.param()
        const { path, parameters, customIdentifier, __internal } =
          c.req.valid('json')

        const workspace = c.get('workspace')
        const { document, commit, project } = await getData({
          workspace,
          projectId: Number(projectId!),
          commitUuid: versionUuid!,
          documentPath: path!,
        }).then((r) => r.unwrap())

        if (__internal?.source === LogSources.API) {
          await publishDocumentRunRequestedEvent({
            workspace,
            project,
            commit,
            document,
            parameters,
          })
        }

        const result = await runDocumentAtCommit({
          workspace,
          document,
          commit,
          parameters,
          customIdentifier,
          source: __internal?.source ?? LogSources.API,
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
        const unknownError = getUnknownError(error)

        if (unknownError) {
          captureException(error)
        }

        return Promise.resolve()
      },
    )
  },
)
