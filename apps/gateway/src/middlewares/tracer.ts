import tracer from '../common/tracer'
import { Context, Next } from 'hono'

function isResponse(value: unknown): value is Response {
  return value instanceof Response
}

export function tracerMiddleware() {
  return async (c: Context, next: Next) => {
    return await tracer.wrap(
      'hono.request',
      {
        tags: {
          'http.method': c.req.method,
          'http.url': c.req.url,
          'http.route': c.req.path,
          'http.useragent': c.req.header('user-agent'),
          'http.request_id': c.req.header('x-request-id'),
        },
      },
      async () => {
        const span = tracer.scope().active()
        if (!span) return await next()

        try {
          const response = await next()

          // If we have user/workspace info (authenticated request), add it to the span
          if (c.get('workspace')) {
            span.setTag('workspace.id', c.get('workspace').id)
            span.setTag('workspace.name', c.get('workspace').name)
          }
          if (c.get('user')) {
            span.setTag('user.id', c.get('user').id)
            span.setTag('user.email', c.get('user').email)
          }

          // Add response status
          if (isResponse(response)) {
            span.setTag('http.status_code', response.status)
          }

          return response
        } catch (error: unknown) {
          if (error instanceof Error) {
            span.setTag('error', true)
            span.setTag('error.type', error.name)
            span.setTag('error.message', error.message)
            span.setTag('error.stack', error.stack)
          }
          throw error
        }
      },
    )()
  }
}
