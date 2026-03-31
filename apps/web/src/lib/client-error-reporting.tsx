import { createLogger, SpanStatusCode, trace } from "@repo/observability"
import { Button, Text, useMountEffect } from "@repo/ui"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

const logger = createLogger("client-error")

const reportClientError = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      message: z.string(),
      stack: z.string().optional(),
      componentStack: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const tracer = trace.getTracer("web")
    tracer.startActiveSpan("client.error", (span) => {
      const error = new Error(data.message)
      if (data.stack) error.stack = data.stack
      span.recordException(error)
      if (data.componentStack) {
        span.setAttribute("error.component_stack", data.componentStack)
      }
      span.setStatus({ code: SpanStatusCode.ERROR, message: data.message })
      span.end()
    })
    logger.error({ message: data.message, componentStack: data.componentStack })
  })

export function ErrorFallback({
  error,
  componentStack,
  reset,
}: {
  error: Error
  componentStack?: string | null
  reset: () => void
}) {
  useMountEffect(() => {
    reportClientError({
      data: {
        message: error.message,
        stack: error.stack,
        componentStack: componentStack ?? undefined,
      },
    }).catch(() => {}) // best-effort — don't throw from error boundary
  })

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <Text.H3>Something went wrong</Text.H3>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
