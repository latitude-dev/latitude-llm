import { LogSources } from '@latitude-data/core/browser'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { publisher } from '@latitude-data/core/events/publisher'
import { createSdk } from '$/app/(private)/_lib/createSdk'

import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { captureException } from '$/helpers/captureException'

const inputSchema = z.object({
  path: z.string(),
  commitUuid: z.string(),
  parameters: z.record(z.any()),
  stream: z.boolean().default(true),
})

export const POST = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        workspace,
        user,
      }: {
        params: {
          documentUuid: string
        }
        workspace: any
        user: any
      },
    ) => {
      const body = await req.json()

      try {
        const { path, commitUuid, parameters } = inputSchema.parse(body)
        const projectId = Number(body.projectId)

        // Publish document run event
        publisher.publishLater({
          type: 'documentRunRequested',
          data: {
            projectId,
            commitUuid,
            documentPath: path,
            parameters,
            workspaceId: workspace.id,
            userEmail: user.email,
          },
        })

        // Create SDK
        const sdkResult = await createSdk({
          workspace,
          projectId,
          __internal: { source: LogSources.Playground },
        })

        if (sdkResult.error) {
          return NextResponse.json(
            { message: 'Failed to create SDK', error: sdkResult.error },
            { status: 500 },
          )
        }

        const sdk = sdkResult.unwrap()

        // Create a TransformStream to handle the streaming response
        const { readable, writable } = new TransformStream()
        const writer = writable.getWriter()
        const encoder = new TextEncoder()

        req.signal.addEventListener('abort', () => {
          writer.abort()
        })

        try {
          sdk.prompts.run(path, {
            stream: true,
            versionUuid: commitUuid,
            parameters,
            onEvent: async (event) => {
              try {
                await writer.write(
                  encoder.encode(
                    `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`,
                  ),
                )
              } catch (error) {
                captureException(error as Error)
                // Try to send error to client before closing
                try {
                  await writer.write(
                    encoder.encode(
                      `event: error\ndata: ${JSON.stringify({
                        name: 'StreamWriteError',
                        message: 'Failed to write to stream',
                      })}\n\n`,
                    ),
                  )
                } finally {
                  writer.close()
                }
              }
            },
            onError: async (error) => {
              captureException(error)

              try {
                await writer.write(
                  encoder.encode(
                    `event: error\ndata: ${JSON.stringify({
                      name: error?.name || 'UnknownError',
                      message: error?.message || 'An unexpected error occurred',
                      stack: error?.stack,
                    })}\n\n`,
                  ),
                )
              } catch (writeError) {
                captureException(writeError as Error)
              } finally {
                writer.close()
              }
            },
            onFinished: () => {
              writer.close().catch((error) => {
                captureException(error)
              })
            },
            signal: req.signal,
          })
        } catch (error) {
          captureException(error as Error)
          try {
            await writer.write(
              encoder.encode(
                `event: error\ndata: ${JSON.stringify({
                  name: 'ExecutionError',
                  message: 'Failed to execute prompt',
                })}\n\n`,
              ),
            )
          } catch (writeError) {
            captureException(writeError as Error)
          } finally {
            writer.close()
          }
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

        if (error instanceof z.ZodError) {
          return NextResponse.json(
            { message: 'Invalid input', details: error.errors },
            { status: 400 },
          )
        }

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
