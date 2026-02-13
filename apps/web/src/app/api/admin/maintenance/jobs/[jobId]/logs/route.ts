import { NextRequest } from 'next/server'
import { errorHandler } from '$/middlewares/errorHandler'
import { adminHandler } from '$/middlewares/adminHandler'
import { createLogReader } from '@latitude-data/core/jobs/utils/maintenanceJobLogger'

export const GET = errorHandler(
  adminHandler(
    async (req: NextRequest, { params }: { params: { jobId: string } }) => {
      const { jobId } = params
      const reader = createLogReader(jobId)

      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          let lastId = '0-0'

          try {
            while (true) {
              if (req.signal.aborted) break

              const data = await reader.read({
                lastId,
                timeout: 5000,
                abortSignal: req.signal,
              })

              if (!data) continue

              lastId = data.lastId
              for (const [, fields] of data.result) {
                const eventJson = fields[1]
                if (!eventJson) continue

                let parsed: { level?: string }
                try {
                  parsed = JSON.parse(eventJson)
                } catch {
                  continue
                }

                const eventType = parsed.level === 'done' ? 'done' : 'log'
                controller.enqueue(
                  encoder.encode(`event: ${eventType}\ndata: ${eventJson}\n\n`),
                )

                if (parsed.level === 'done') {
                  await reader.close()
                  controller.close()
                  return
                }
              }
            }
          } catch {
            // Client disconnected or abort
          } finally {
            await reader.close()
            try {
              controller.close()
            } catch {
              // Already closed
            }
          }
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    },
  ),
)
