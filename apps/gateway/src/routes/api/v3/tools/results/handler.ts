import { AppRouteHandler } from '$/openApi/types'
import { publisher } from '@latitude-data/core/events/publisher'
import { ClientToolResultRoute } from './route'

// @ts-expect-error: streamSSE has type issues with zod-openapi
export const clientToolResultHandler: AppRouteHandler<
  ClientToolResultRoute
> = async (c) => {
  const { toolCallId, result, isError } = await c.req.json()

  publisher.publish('clientToolResultReceived', {
    toolCallId,
    result,
    isError,
  })

  return c.json({ success: true }, 200)
}
