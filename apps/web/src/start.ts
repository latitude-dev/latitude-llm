// OpenTelemetry instrumentation MUST be imported first

import type { DomainError } from "@domain/shared"
import { SpanStatusCode, trace } from "@opentelemetry/api"
import { createLogger, initializeObservability } from "@repo/observability"
import { isHttpError } from "@repo/utils"
import { createMiddleware, createStart } from "@tanstack/react-start"

await initializeObservability({ serviceName: "web" })

const tracer = trace.getTracer("web")
const logger = createLogger("server-fn")

export const tracingRequestMiddleware = createMiddleware({ type: "request" }).server(async ({ next, request }) => {
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

export const tracingFnMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  return tracer.startActiveSpan("function", async (span) => {
    try {
      return await next()
    } catch (e) {
      const httpError = isHttpError(e)
      const tag =
        typeof e === "object" && e !== null && "_tag" in (e as DomainError) ? (e as DomainError)._tag : undefined
      const message = httpError ? e.httpMessage : e instanceof Error ? e.message : "Unknown error occurred"
      const status = httpError ? e.httpStatus : 500

      const payload = JSON.stringify({ _tag: tag, message, status })
      const error = new Error(payload)

      if (e instanceof Error && e.stack) error.stack = e.stack

      logger.error({ _tag: tag, message, status })

      throw error
    } finally {
      span.end()
    }
  })
})

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [tracingRequestMiddleware],
    functionMiddleware: [tracingFnMiddleware],
  }
})
