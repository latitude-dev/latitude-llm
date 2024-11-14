import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  chainEventDtoSchema,
  LogSources,
  runSyncAPIResponseSchema,
} from '@latitude-data/core/browser'
import { getUnknownError } from '@latitude-data/core/lib/getUnknownError'
import { streamToGenerator } from '@latitude-data/core/lib/streamToGenerator'
import { runDocumentAtCommit } from '@latitude-data/core/services/commits/runDocumentAtCommit'
import http from '$/common/http'
import { captureException } from '$/common/sentry'
import {
  chainEventPresenter,
  getData,
  publishDocumentRunRequestedEvent,
} from '$/routes/api/v1/projects/[projectId]/versions/[versionUuid]/documents/handlers/_shared'
import { streamSSE } from 'hono/streaming'

import { documentRunPresenter } from './documentPresenter'

export const runHandler = new OpenAPIHono()

runHandler.openapi(
  createRoute({
    method: http.Methods.POST,
    path: '',
    request: {
      params: z.object({
        projectId: z.string(),
        versionUuid: z.string(),
      }),
      body: {
        content: {
          [http.MediaTypes.JSON]: {
            schema: z.object({
              path: z.string(),
              stream: z.boolean().default(false),
              customIdentifier: z.string().optional(),
              parameters: z.record(z.any()).optional().default({}),
              __internal: z
                .object({
                  source: z.nativeEnum(LogSources).optional(),
                })
                .optional(),
            }),
          },
        },
      },
    },
    responses: {
      [http.Status.OK]: {
        description:
          'If stream is true, returns a SSE stream. Otherwise, returns the final event as JSON.',
        content: {
          [http.MediaTypes.JSON]: { schema: runSyncAPIResponseSchema },
          [http.MediaTypes.SSE]: { schema: chainEventDtoSchema },
        },
      },
      // TODO: Error responses
    },
  }),
  // TODO: what we do with this?
  // @ts-expect-error: streamSSE has type issues with zod-openapi
  // https://github.com/honojs/middleware/issues/735
  // https://github.com/orgs/honojs/discussions/1803
  async (c) => {
    const { projectId, versionUuid } = c.req.valid('param')
    const {
      path,
      parameters,
      customIdentifier,
      stream: useSSE,
      __internal,
    } = c.req.valid('json')
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
