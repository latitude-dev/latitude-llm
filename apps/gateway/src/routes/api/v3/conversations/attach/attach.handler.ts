import { captureException } from '$/common/tracer'
import { createRequestAbortSignal } from '$/common/createRequestAbortSignal'
import { AppRouteHandler } from '$/openApi/types'
import { runPresenter } from '$/presenters/runPresenter'
import { unsafelyFindActiveRun } from '@latitude-data/core/data-access/runs'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { getUnknownError } from '@latitude-data/core/lib/getUnknownError'
import { isAbortError } from '@latitude-data/core/lib/isAbortError'
import { ProjectsRepository } from '@latitude-data/core/repositories'
import { attachRun } from '@latitude-data/core/services/runs/attach'
import { streamSSE } from 'hono/streaming'
import { AttachRoute } from './attach.route'

// https://github.com/honojs/middleware/issues/735
// https://github.com/orgs/honojs/discussions/1803
// @ts-expect-error: streamSSE has type issues with zod-openapi
export const attachHandler: AppRouteHandler<AttachRoute> = async (ctx) => {
  const { conversationUuid } = ctx.req.valid('param')
  const { stream } = ctx.req.valid('json')
  const workspace = ctx.get('workspace')

  const run = await unsafelyFindActiveRun(conversationUuid).then((r) => r.unwrap()) // prettier-ignore
  if (run.workspaceId !== workspace.id) {
    throw new NotFoundError(
      `Active run with uuid ${conversationUuid} not found`,
    )
  }

  const repository = new ProjectsRepository(workspace.id)
  const project = await repository
    .getProjectById(run.projectId)
    .then((r) => r.unwrap())

  const args = { run, project, workspace }
  if (stream) return handleStreamingMode(ctx, args)
  return await handleNonStreamingMode(ctx, args)
}

async function handleStreamingMode(
  ctx: Parameters<AppRouteHandler<AttachRoute>>[0],
  args: Parameters<typeof attachRun>[0],
) {
  return streamSSE(
    ctx,
    async (stream) => {
      const abortController = new AbortController()
      stream.onAbort(() => {
        abortController.abort()
        stream.close()
      })
      const abortSignal = abortController.signal

      try {
        let id = 0
        await attachRun({
          ...args,
          abortSignal: abortSignal,
          onEvent: ({ event, data }) => {
            stream.writeSSE({
              id: String(id++),
              event: event,
              data: typeof data === 'string' ? data : JSON.stringify(data),
            })
          },
        }).then((r) => r.unwrap())
      } catch (error) {
        // Handle abort errors gracefully - don't log them as actual errors
        if (isAbortError(error)) return

        // Re-throw other errors to be handled by the error callback
        throw error
      }
    },
    (error: Error) => {
      // Handle abort errors gracefully - don't log them as actual errors
      if (isAbortError(error)) return Promise.resolve()

      const unknownError = getUnknownError(error)
      if (unknownError) captureException(error)

      return Promise.resolve()
    },
  )
}

async function handleNonStreamingMode(
  ctx: Parameters<AppRouteHandler<AttachRoute>>[0],
  args: Parameters<typeof attachRun>[0],
) {
  const abortSignal = createRequestAbortSignal(ctx)
  const result = await attachRun({ ...args, abortSignal }).then((r) => r.unwrap()) // prettier-ignore

  // Wait for stream to finish
  const error = result.error
  if (error) throw error

  const response = result.lastResponse!
  const body = runPresenter({
    response,
    source: undefined,
  }).unwrap()

  return ctx.json(body)
}
