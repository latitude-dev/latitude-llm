import { buildAgentEventsStreamKey } from "@domain/agent"
import { createFileRoute } from "@tanstack/react-router"
import { getBetterAuth, getRedisClient } from "../../../../server/clients.ts"

const ENCODER = new TextEncoder()
const POLL_INTERVAL_MS = 300

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Server-Sent Events stream of a command-palette agent session's live events. Authenticates once, then
 * tails the session's Redis Stream with a non-blocking XRANGE poll (blocking reads would stall the
 * shared connection and trip its command timeout) and forwards each entry as an SSE frame. The
 * connection stays open across turns (a `done`/`error` ends a turn, not the session) so follow-ups
 * stream on the same connection; it closes on client disconnect. Supports `Last-Event-ID` resume.
 */
export const Route = createFileRoute("/api/agent/$sessionId/events")({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { sessionId: string } }) => {
        const session = await getBetterAuth().api.getSession({ headers: request.headers })
        if (!session?.user) return new Response("Unauthorized", { status: 401 })
        const organizationId = session.session.activeOrganizationId
        if (!organizationId) return new Response("No active organization", { status: 403 })

        const redis = getRedisClient()
        const streamKey = buildAgentEventsStreamKey(organizationId, params.sessionId)
        const signal = request.signal
        let lastId = request.headers.get("last-event-id") ?? "0"

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            let closed = false
            const close = () => {
              if (closed) return
              closed = true
              try {
                controller.close()
              } catch {
                // controller already closed
              }
            }
            signal.addEventListener("abort", close)
            controller.enqueue(ENCODER.encode(": open\n\n"))

            try {
              while (!closed && !signal.aborted) {
                const entries = (await redis
                  .xrange(streamKey, `(${lastId}`, "+", "COUNT", 100)
                  .catch(() => [] as [string, string[]][])) as [string, string[]][]

                if (entries.length === 0) {
                  controller.enqueue(ENCODER.encode(": ping\n\n"))
                  await sleep(POLL_INTERVAL_MS)
                  continue
                }

                for (const [id, fields] of entries) {
                  lastId = id
                  const dataIndex = fields.indexOf("data")
                  const payload = dataIndex >= 0 ? fields[dataIndex + 1] : "{}"
                  controller.enqueue(ENCODER.encode(`id: ${id}\ndata: ${payload}\n\n`))
                }
              }
            } finally {
              signal.removeEventListener("abort", close)
              close()
            }
          },
        })

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        })
      },
    },
  },
})
