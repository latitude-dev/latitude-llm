import { LogSources } from '@latitude-data/core/browser'
import { getUnknownError } from '@latitude-data/core/lib/getUnknownError'
import { streamToGenerator } from '@latitude-data/core/lib/streamToGenerator'
import { runDocumentAtCommit } from '@latitude-data/core/services/commits/runDocumentAtCommit'
import { captureException } from '$/common/sentry'
import { streamSSE } from 'hono/streaming'
import {
  chainEventPresenter,
  getData,
  publishDocumentRunRequestedEvent,
} from '$/common/documents/getData'
import { AppRouteHandler } from '$/openApi/types'
import { RunRoute } from '$/routes/v1/run/run.route'

// @ts-expect-error: streamSSE has type issues with zod-openapi
export const runHandler: AppRouteHandler<RunRoute> = async (c) => {
  return streamSSE(
    c,
    async (stream) => {
      const { projectId, versionUuid } = c.req.valid('param')
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
}
