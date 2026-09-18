import { createLogger, recordSpanExceptionForDatadog, SpanStatusCode, trace } from "@repo/observability"
import { Button, CopyableText, cn, Text, useMountEffect } from "@repo/ui"
import { CatchBoundary, useRouterState } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { type ReactNode, useMemo } from "react"
import { z } from "zod"
import { CHUNK_LOAD_RELOAD_SESSION_KEY, isChunkLoadError } from "./chunk-load-error.ts"

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
      recordSpanExceptionForDatadog(span, error)
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
  variant,
}: {
  error: Error
  componentStack?: string | null
  reset: () => void
  variant: "fullscreen" | "contained"
}) {
  const errorId = useMemo(() => generateErrorId(), [])

  useMountEffect(() => {
    // A stale tab's chunk hash from a prior deploy: one reload fetches the current
    // asset manifest and resolves it. Guarded by sessionStorage so a persistent
    // failure (e.g. the asset is actually gone) falls through to the fallback UI
    // instead of reloading forever.
    if (isChunkLoadError(error) && window.sessionStorage.getItem(CHUNK_LOAD_RELOAD_SESSION_KEY) !== "1") {
      window.sessionStorage.setItem(CHUNK_LOAD_RELOAD_SESSION_KEY, "1")
      window.location.reload()
      return
    }

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
    <div
      className={cn("flex flex-col items-center justify-center gap-4 p-8", {
        "min-h-screen": variant === "fullscreen",
        "h-full min-h-0": variant === "contained",
      })}
    >
      <Text.H3>Something went wrong</Text.H3>
      <Text.H5 color="foregroundMuted">
        If this error persists, please contact support and reference this error ID:
      </Text.H5>
      <div className="flex justify-center">
        <CopyableText value={errorId} tooltip="Copy error ID" />
      </div>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}

/**
 * Scopes render errors to a content region: the fallback renders in place of
 * `children` while the surrounding shell (sidebar, nav) stays interactive,
 * instead of the error bubbling to the root boundary and replacing the whole
 * app. Resets automatically on navigation (the pathname is the reset key).
 */
export function ContentErrorBoundary({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  return (
    <CatchBoundary
      getResetKey={() => pathname}
      errorComponent={({ error, reset }) => <ErrorFallback error={error} reset={reset} variant="contained" />}
    >
      {children}
    </CatchBoundary>
  )
}
