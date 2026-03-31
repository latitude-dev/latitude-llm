import { SpanStatusCode } from "@opentelemetry/api"
import { initializeObservability, trace } from "@repo/observability"
import { createMiddleware, createStart } from "@tanstack/react-start"

// Initialize observability at startup (not per-request)
await initializeObservability({
  serviceName: "web",
})

const tracer = trace.getTracer("web")

export const tracingMiddleware = createMiddleware({ type: "request" }).server(async ({ next, request }) => {
  const url = new URL(request.url)

  return tracer.startActiveSpan(`${request.method} ${url.pathname}`, async (span) => {
    span.setAttributes({
      "http.method": request.method,
      "http.url": request.url,
      "http.route": url.pathname,
      "http.host": url.host,
    })

    try {
      const result = await next()
      if (result.response) {
        span.setAttribute("http.status_code", result.response.status)
        span.setStatus({ code: SpanStatusCode.OK })
      }
      return result
    } catch (error) {
      span.recordException(error as Error)
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      })
      throw error
    } finally {
      span.end()
    }
  })
})

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [tracingMiddleware],
  }
})
