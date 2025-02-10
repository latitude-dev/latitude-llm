import { streamSSE } from 'hono/streaming'
import { AppRouteHandler } from '$/openApi/types'
import { RunRoute } from '$/routes/v2/documents/run/run.route'
import { LogSources } from '@latitude-data/core/browser'
import { runDocumentAtCommit } from '@latitude-data/core/services/commits/runDocumentAtCommit'
import { streamToGenerator } from '@latitude-data/core/lib/streamToGenerator'
import { getUnknownError } from '@latitude-data/core/lib/getUnknownError'
import { captureException } from '$/common/sentry'
import {
  legacyChainEventPresenter,
  getData,
  publishDocumentRunRequestedEvent,
} from '$/common/documents/getData'
import { v2RunPresenter } from '$/presenters/runPresenter'
import { convertToLegacyChainStream } from '@latitude-data/core/lib/chainStreamManager/index'

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

  const {
    stream: newStream,
    lastResponse,
    error,
  } = await runDocumentAtCommit({
    workspace,
    document,
    commit,
    parameters,
    customIdentifier,
    source: __internal?.source ?? LogSources.API,
  }).then((r) => r.unwrap())

  const { stream: legacyStream } = convertToLegacyChainStream(newStream)

  if (useSSE) {
    return streamSSE(
      c,
      async (stream) => {
        let id = 0
        for await (const event of streamToGenerator(legacyStream)) {
          const data = legacyChainEventPresenter(event)

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

  const awaitedError = await error
  if (awaitedError) throw awaitedError

  const response = await lastResponse
  const body = v2RunPresenter(response!).unwrap()
  return c.json(body)
}
