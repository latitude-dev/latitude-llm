import { zValidator } from '@hono/zod-validator'
import { LogSources } from '@latitude-data/core/browser'
import { getUnknownError } from '@latitude-data/core/lib/getUnknownError'
import { streamToGenerator } from '@latitude-data/core/lib/streamToGenerator'
import { runDocumentAtCommit } from '@latitude-data/core/services/commits/runDocumentAtCommit'
import { captureException } from '$/common/sentry'
import {
  chainEventPresenter,
  getData,
} from '$/routes/api/v1/projects/[projectId]/versions/[versionUuid]/documents/handlers/_shared'
import { Factory } from 'hono/factory'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'

import { documentRunPresenter } from './documentPresenter'

const factory = new Factory()

const runSchema = z.object({
  path: z.string(),
  stream: z.boolean().default(false),
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
    const { projectId, versionUuid } = c.req.param()
    const {
      path,
      parameters,
      customIdentifier,
      stream: useSSE,
      __internal,
    } = c.req.valid('json')
    const workspace = c.get('workspace')
    const { document, commit } = await getData({
      workspace,
      projectId: Number(projectId!),
      commitUuid: versionUuid!,
      documentPath: path!,
    }).then((r) => r.unwrap())

    const result = await runDocumentAtCommit({
      workspace,
      document,
      commit,
      parameters,
      customIdentifier,
      source: __internal?.source ?? LogSources.API,
    }).then((r) => r.unwrap())

    if (useSSE) {
      return streamSSE(
        c,
        async (stream) => {
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
    }

    const response = await result.response.then((r) => r.unwrap())
    const body = documentRunPresenter(response).unwrap()
    return c.json(body)
  },
)
