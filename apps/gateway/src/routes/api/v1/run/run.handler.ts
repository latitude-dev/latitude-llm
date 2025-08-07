import {
  getData,
  legacyChainEventPresenter,
  publishDocumentRunRequestedEvent,
} from '$/common/documents/getData'
import { captureException } from '$/common/sentry'
import { AppRouteHandler } from '$/openApi/types'
import { RunRoute } from '$/routes/api/v1/run/run.route'
import { convertToLegacyChainStream } from '@latitude-data/core/__deprecated/lib/chainStreamManager/index'
import { LogSources } from '@latitude-data/core/browser'
import { getUnknownError } from '@latitude-data/core/lib/getUnknownError'
import { streamToGenerator } from '@latitude-data/core/lib/streamToGenerator'
import { runDocumentAtCommitLegacy } from '@latitude-data/core/services/__deprecated/commits/runDocumentAtCommit'
import { BACKGROUND } from '@latitude-data/core/telemetry'
import { streamSSE } from 'hono/streaming'

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

      const { stream: newStream } = await runDocumentAtCommitLegacy({
        context: BACKGROUND({ workspaceId: workspace.id }),
        workspace,
        document,
        commit,
        parameters,
        customIdentifier,
        source: __internal?.source ?? LogSources.API,
      }).then((r) => r.unwrap())

      const { stream: legacyStream } = convertToLegacyChainStream(newStream)

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
