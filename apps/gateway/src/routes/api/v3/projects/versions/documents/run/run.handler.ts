import { streamSSE } from 'hono/streaming'
import { AppRouteHandler } from '$/openApi/types'
import { LogSources } from '@latitude-data/core/browser'
import { runDocumentAtCommit } from '@latitude-data/core/services/commits/runDocumentAtCommit'
import { streamToGenerator } from '@latitude-data/core/lib/streamToGenerator'
import { getUnknownError } from '@latitude-data/core/lib/getUnknownError'
import { captureException } from '$/common/sentry'
import {
  getData,
  publishDocumentRunRequestedEvent,
} from '$/common/documents/getData'
import { runPresenter } from '$/presenters/runPresenter'
import { RunRoute } from './run.route'

// https://github.com/honojs/middleware/issues/735
// https://github.com/orgs/honojs/discussions/1803
// @ts-expect-error: streamSSE has type issues with zod-openapi
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
    abortSignal: c.req.raw.signal,
  }).then((r) => r.unwrap())

  if (useSSE) {
    return streamSSE(
      c,
      async (stream) => {
        let id = 0

        c.req.raw.signal.addEventListener('abort', () => {
          stream.close()
        })

        for await (const event of streamToGenerator(result.stream)) {
          const data = event.data

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

  const error = await result.error
  if (error) throw error

  const response = (await result.lastResponse)!
  const toolCalls = await result.toolCalls

  const body = runPresenter({ response, toolCalls }).unwrap()
  return c.json(body)
}
