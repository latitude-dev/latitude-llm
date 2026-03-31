import { createLogger, SpanStatusCode, trace } from "@repo/observability"
import { Button, CopyButton, Text, useMountEffect } from "@repo/ui"
import { createServerFn } from "@tanstack/react-start"
import { useMemo } from "react"
import { z } from "zod"

const logger = createLogger("client-error")

function generateErrorId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

const reportClientError = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      errorId: z.string(),
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
      span.setAttribute("error.id", data.errorId)
      if (data.componentStack) {
        span.setAttribute("error.component_stack", data.componentStack)
      }
      span.setStatus({ code: SpanStatusCode.ERROR, message: data.message })
      span.end()
    })
    logger.error({
      errorId: data.errorId,
      message: data.message,
      componentStack: data.componentStack,
    })
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
  const errorId = useMemo(() => generateErrorId(), [])

  useMountEffect(() => {
    reportClientError({
      data: {
        errorId,
        message: error.message,
        stack: error.stack,
        componentStack: componentStack ?? undefined,
      },
    }).catch(() => {}) // best-effort — don't throw from error boundary
  })

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <Text.H3>Something went wrong</Text.H3>
      <Text.H5 color="foregroundMuted">
        If this error persists, please contact support and reference this error
        ID:
      </Text.H5>
      <div className="flex items-center gap-1">
        <code className="font-mono text-sm bg-muted px-1.5 py-0.5 rounded">
          {errorId}
        </code>
        <CopyButton value={errorId} tooltip="Copy error ID" />
      </div>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
