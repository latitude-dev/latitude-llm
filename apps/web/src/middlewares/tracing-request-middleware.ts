import type { Span, Tracer } from "@repo/observability"
import { SpanStatusCode } from "@repo/observability"
import { createMiddleware } from "@tanstack/react-start"
import { isMissingServerFnError } from "../lib/stale-server-fn.ts"
import { asStaleServerFnError, recordRequestError, staleServerFnResponse } from "./server-fn-error.ts"

export const tracingRequestMiddleware = ({ tracer }: { tracer: Tracer }) =>
  createMiddleware({ type: "request" }).server(async ({ next, request }) => {
    const url = new URL(request.url)

    return tracer.startActiveSpan(`${request.method} ${url.pathname}`, async (span: Span) => {
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
        if (isMissingServerFnError(error) && error instanceof Error) {
          const shaped = asStaleServerFnError(error)
          recordRequestError(span, shaped)
          const response = staleServerFnResponse(shaped)
          span.setAttribute("http.status_code", response.status)
          return response
        }
        recordRequestError(span, error)
        throw error
      } finally {
        span.end()
      }
    })
  })
