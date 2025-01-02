import { chainEventPresenter } from '$/common/documents/getData'
import { AppRouteHandler } from '$/openApi/types'
import { runPresenter } from '$/presenters/runPresenter'
import { ResumeRoute } from '$/routes/v2/conversations/resume/resume.route'
import { LogSources } from '@latitude-data/core/browser'
import { getUnknownError } from '@latitude-data/core/lib/getUnknownError'
import { streamToGenerator } from '@latitude-data/core/lib/streamToGenerator'
import { resumeConversation } from '@latitude-data/core/services/documentLogs/index'
import { captureException } from '@sentry/node'
import { streamSSE } from 'hono/streaming'

// @ts-expect-error: streamSSE has type issues
export const resumeHandler: AppRouteHandler<ResumeRoute> = async (c) => {
  const { conversationUuid: documentLogUuid } = c.req.valid('param')

  const {
    versionUuid: commitUuid,
    toolCallResponses,
    stream: useSSE,
    __internal,
  } = c.req.valid('json')
  const workspace = c.get('workspace')

  const result = (
    await resumeConversation({
      workspace,
      commitUuid,
      documentLogUuid,
      toolCallResponses,
      source: __internal?.source ?? LogSources.API,
    })
  ).unwrap()

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

  const response = (await result.response).unwrap()
  const body = runPresenter(response).unwrap()

  return c.json(body, 200)
}
