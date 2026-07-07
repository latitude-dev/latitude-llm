import type { Span, Tracer } from "@repo/observability"
import { type createLogger, SpanStatusCode } from "@repo/observability"
import { createMiddleware } from "@tanstack/react-start"
import { recordServerFnError } from "./server-fn-error.ts"

type Logger = ReturnType<typeof createLogger>

type ServerFnMeta = {
  readonly id?: string
  readonly name?: string
  readonly filename?: string
}

type ServerFnMiddlewareArgs = {
  readonly data?: unknown
  readonly request?: Request
  readonly serverFnMeta?: ServerFnMeta
}

const getStringField = (value: unknown, key: string): string | undefined => {
  if (typeof value !== "object" || value === null) return undefined
  const field = (value as Record<string, unknown>)[key]
  return typeof field === "string" && field.length > 0 ? field : undefined
}

const getDataKeys = (data: unknown): string[] => {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return []
  return Object.keys(data).sort()
}

const SERVER_FN_ID_PATTERN = /^\/[A-Za-z0-9_-]+\/([a-f0-9]{64})$/

const getServerFnIdFromPath = (pathname: string): string | undefined => {
  const match = pathname.match(SERVER_FN_ID_PATTERN)
  return match?.[1]
}

export const tracingFnMiddleware = ({ tracer, logger }: { tracer: Tracer; logger: Logger }) =>
  createMiddleware({ type: "function" }).server(async (rawArgs) => {
    const args = rawArgs as typeof rawArgs & ServerFnMiddlewareArgs
    const request = args.request
    const url = request ? new URL(request.url) : undefined
    const serverFnMeta = args.serverFnMeta
    const serverFnName = serverFnMeta?.name
    const serverFnId = serverFnMeta?.id ?? (url ? getServerFnIdFromPath(url.pathname) : undefined)
    const route = serverFnName ? `/_serverFn/${serverFnName}` : url?.pathname
    const spanName = serverFnName
      ? `server-fn ${serverFnName}`
      : request && url
        ? `server-fn ${request.method} ${url.pathname}`
        : "server-fn"

    return tracer.startActiveSpan(spanName, async (span: Span) => {
      if (request && url) {
        span.setAttributes({
          "http.method": request.method,
          "http.url": request.url,
          "http.route": route ?? url.pathname,
          "http.host": url.host,
        })
      }

      if (serverFnName) span.updateName(`server-fn ${serverFnName}`)

      const dataKeys = getDataKeys(args.data)
      const projectId = getStringField(args.data, "projectId")
      const traceId = getStringField(args.data, "traceId")
      const signalId = getStringField(args.data, "signalId")
      const datasetId = getStringField(args.data, "datasetId")

      span.setAttributes({
        "server_fn.name": serverFnName ?? "unknown",
        "server_fn.id": serverFnId ?? "unknown",
        "server_fn.filename": serverFnMeta?.filename ?? "unknown",
        "server_fn.input.keys": dataKeys.join(","),
        "server_fn.input.has_project_id": projectId !== undefined,
        "server_fn.input.has_trace_id": traceId !== undefined,
      })
      if (projectId) span.setAttribute("project.id", projectId)
      if (traceId) span.setAttribute("trace.trace_id", traceId)
      if (signalId) span.setAttribute("issue.id", signalId)
      if (datasetId) span.setAttribute("dataset.id", datasetId)

      try {
        const result = await rawArgs.next()
        span.setStatus({ code: SpanStatusCode.OK })
        return result
      } catch (e) {
        const { error, tag, message, status, isClientError } = recordServerFnError(span, e)

        const log = isClientError ? logger.warn : logger.error
        log({
          _tag: tag,
          message,
          status,
          serverFnName,
          serverFnId,
          serverFnFilename: serverFnMeta?.filename,
          dataKeys,
          hasProjectId: projectId !== undefined,
          hasTraceId: traceId !== undefined,
        })

        throw error
      } finally {
        span.end()
      }
    })
  })
