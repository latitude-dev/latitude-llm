import { AppRouteHandler } from '$/openApi/types'
import { ClientToolResultRoute } from './route'
import { publisher } from '@latitude-data/core/events/publisher'

// @ts-expect-error: streamSSE has type issues with zod-openapi
export const clientToolResultHandler: AppRouteHandler<
  ClientToolResultRoute
> = async (c) => {
  const { toolCallId, result } = await c.req.json()

  publisher.publish('clientToolResultReceived', {
    toolCallId,
    result,
  })

  return c.json({ success: true }, 200)
}
