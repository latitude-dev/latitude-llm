import { streamSSE } from 'hono/streaming'
import { AppRouteHandler } from '$/openApi/types'
import { RunRoute } from '$/routes/v2/documents/run/run.route'
import { LogSources } from '@latitude-data/core/browser'
import { runDocumentAtCommit } from '@latitude-data/core/services/commits/runDocumentAtCommit'
import { streamToGenerator } from '@latitude-data/core/lib/streamToGenerator'
import { getUnknownError } from '@latitude-data/core/lib/getUnknownError'
import { captureException } from '$/common/sentry'
import {
  chainEventPresenter,
  getData,
  publishDocumentRunRequestedEvent,
} from '$/common/documents/getData'
import { runPresenter } from '$/presenters/runPresenter'

// @ts-expect-error: streamSSE has type issues with zod-openapi
// https://github.com/honojs/middleware/issues/735
// https://github.com/orgs/honojs/discussions/1803
export const runHandler: AppRouteHandler<RunRoute> = async (c) => {
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
  const body = runPresenter(response).unwrap()
  return c.json(body)
}
