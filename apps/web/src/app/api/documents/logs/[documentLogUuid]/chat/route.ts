import { type ToolCall, type ToolContent } from '@latitude-data/compiler'
import {
  LogSources,
  toolCallSchema,
  traceContextSchema,
  User,
  Workspace,
} from '@latitude-data/core/browser'
import {
  BACKGROUND,
  telemetry,
  TelemetryContext,
} from '@latitude-data/core/telemetry'
import { type Message } from '@latitude-data/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { createSdk } from '$/app/(private)/_lib/createSdk'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { publisher } from '@latitude-data/core/events/publisher'

const inputSchema = z.object({
  messages: z.array(
    z.object({
      role: z.string(),
      content: z.any(),
    }),
  ),
  toolCalls: z.array(toolCallSchema),
  trace: traceContextSchema.optional(),
})

export const POST = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        params,
        workspace,
        user,
      }: {
        params: {
          documentLogUuid: string
        }
        workspace: Workspace
        user: User
      },
    ) => {
      const body = await req.json()

      try {
        const { messages: response, toolCalls, trace } = inputSchema.parse(body)
        const documentLogUuid = params.documentLogUuid
        const messages = response as Message[]
        const context = trace
          ? telemetry.resume(trace)
          : BACKGROUND({ workspaceId: workspace.id })

        // Note: faking playground tool spans so they show in the trace
        await fakeToolSpans(context, messages, toolCalls)

        // Publish chat message event
        publisher.publishLater({
          type: 'chatMessageRequested',
          data: {
            documentLogUuid,
            messages,
            workspaceId: workspace.id,
            userEmail: user.email,
          },
        })

        // Create SDK
        const sdkResult = await createSdk({
          workspace: workspace,
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

async function fakeToolSpans(
  context: TelemetryContext,
  messages: Message[],
  toolCalls: ToolCall[],
) {
  const toolResults = messages.reduce((acc, message) => {
    if (message.role !== 'tool') return acc
    for (const content of message.content) {
      if (content.type !== 'tool-result') continue
      acc.push(content)
    }
    return acc
  }, [] as ToolContent[])

  for (const call of toolCalls) {
    const $tool = telemetry.tool(context, {
      name: call.name,
      call: {
        id: call.id,
        arguments: call.arguments,
      },
    })

    const result = toolResults.find((r) => r.toolCallId === call.id)
    if (result) {
      $tool.end({
        result: {
          value: result.result,
          isError: !!result.isError,
        },
      })
    } else {
      $tool.fail(new Error('Tool call not answered'))
    }
  }
}
