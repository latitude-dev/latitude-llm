import { createSdk } from '$/app/(private)/_lib/createSdk'
import { captureException } from '$/helpers/captureException'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { ChainEventTypes } from '@latitude-data/constants'
import { LogSources, Workspace } from '@latitude-data/core/browser'
import { NextRequest, NextResponse } from 'next/server'

export const POST = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        params,
        workspace,
      }: {
        params: {
          projectId: number
          runUuid: string
        }
        workspace: Workspace
      },
    ) => {
      try {
        const { projectId, runUuid } = params

        const sdk = await createSdk({
          workspace: workspace,
          projectId: projectId,
          __internal: { source: LogSources.Playground },
        }).then((r) => r.unwrap())

        const { readable, writable } = new TransformStream()
        const writer = writable.getWriter()
        const encoder = new TextEncoder()

        let isWriterClosed = false
        const safeCloseWriter = async () => {
          if (!isWriterClosed) {
            isWriterClosed = true
            try {
              await writer.close()
            } catch (error) {
              // No-op, writer might be closed already
            }
          }
        }

        const writeErrorToStream = async (error: Error | unknown) => {
          try {
            await writer.write(
              encoder.encode(
                `event: error\ndata: ${JSON.stringify({
                  name: error instanceof Error ? error.name : 'UnknownError',
                  message:
                    error instanceof Error
                      ? error.message
                      : 'An unexpected error occurred',
                  stack: error instanceof Error ? error.stack : undefined,
                })}\n\n`,
              ),
            )
          } catch (writeError) {
            captureException(writeError as Error)
          } finally {
            await safeCloseWriter()
          }
        }

        const abortHandler = () => writer.abort()
        req.signal.addEventListener('abort', abortHandler)

        try {
          // Note: attaching through the web is always detached
          sdk.runs.attach(runUuid, {
            stream: true,
            interactive: false,
            signal: undefined,
            onEvent: async (event) => {
              try {
                if (event.data.type === ChainEventTypes.ChainError) {
                  captureException(event.data.error)
                }

                await writer.write(
                  encoder.encode(
                    `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`,
                  ),
                )
              } catch (error) {
                captureException(error as Error)
                // Try to send error to client before closing
                await writeErrorToStream(new Error('Failed to write to stream'))
              }
            },
            onError: async (error) => {
              captureException(error)

              await writeErrorToStream(error)
            },
            onFinished: async () => {
              try {
                await writer.write(
                  encoder.encode(
                    `event: finished\ndata: ${JSON.stringify({ success: true })}\n\n`,
                  ),
                )
              } catch (error) {
                captureException(error as Error)
              } finally {
                await safeCloseWriter()
              }
            },
          })
        } catch (error) {
          captureException(error as Error)
          await writeErrorToStream(new Error('Failed to attach run'))
        } finally {
          req.signal.removeEventListener('abort', abortHandler)
        }

        return new NextResponse(readable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        })
      } catch (error) {
        captureException(error as Error)

        // When client closes the connection, the SDK will throw an undefined
        // error or AbortError which we can safely ignore
        if (!error || (error as Error).name === 'AbortError') return

        // For any other error, return a 500 response
        return NextResponse.json(
          {
            message: 'An unexpected error occurred',
            error: error instanceof Error ? error.message : String(error),
          },
          { status: 500 },
        )
      }
    },
  ),
)
