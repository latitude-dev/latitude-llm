import { LogSources, traceContextSchema } from '@latitude-data/core/browser'
import { BACKGROUND, telemetry } from '@latitude-data/core/telemetry'
import { type Message } from '@latitude-data/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { createSdk } from '$/app/(private)/_lib/createSdk'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { getCurrentUserOrError } from '$/services/auth/getCurrentUser'
import { publisher } from '@latitude-data/core/events/publisher'

const inputSchema = z.object({
  messages: z.array(
    z.object({
      role: z.string(),
      content: z.any(),
    }),
  ),
  trace: traceContextSchema.optional(),
})

export const POST = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        params,
      }: {
        params: {
          documentLogUuid: string
        }
        workspace: any
        user: any
      },
    ) => {
      const body = await req.json()

      try {
        const { messages: response, trace } = inputSchema.parse(body)
        const documentLogUuid = params.documentLogUuid
        const messages = response as Message[]
        const context = trace ? telemetry().resume(trace) : BACKGROUND()

        // TODO(tracing): fix this fake tool span not being in the same trace?
        for (const message of messages) {
          if (message.role !== 'tool') continue
          for (const content of message.content) {
            if (content.type !== 'tool-result') continue
            console.log(trace)
            telemetry()
              .tool(context, {
                name: content.toolName,
                call: {
                  id: content.toolCallId,
                  arguments: {},
                },
              })
              .end({
                result: {
                  value: content.result,
                  isError: !!content.isError,
                },
              })
          }
        }

        // Publish chat message event
        publisher.publishLater({
          type: 'chatMessageRequested',
          data: {
            documentLogUuid,
            messages,
            workspaceId: (await getCurrentUserOrError()).workspace.id,
            userEmail: (await getCurrentUserOrError()).user.email,
          },
        })

        // Create SDK
        const sdkResult = await createSdk({
          workspace: (await getCurrentUserOrError()).workspace,
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

        sdk.prompts.chat(documentLogUuid, messages as Message[], {
          stream: true,
          onEvent: async (event) => {
            await writer.write(
              encoder.encode(
                `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`,
              ),
            )
          },
          onError: async (error) => {
            await writer.write(
              encoder.encode(
                `event: error\ndata: ${JSON.stringify({
                  name: error.name,
                  message: error.message,
                  stack: error.stack,
                })}\n\n`,
              ),
            )
            writer.close()
          },
          onFinished: () => {
            writer.close()
          },
          signal: req.signal,
          trace: trace,
        })

        return new NextResponse(readable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        })
      } catch (error) {
        if (error instanceof z.ZodError) {
          return NextResponse.json(
            { message: 'Invalid input', details: error.errors },
            { status: 400 },
          )
        }

        throw error
      }
    },
  ),
)
