import { type Message } from '@latitude-data/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { createSdk } from '$/app/(private)/_lib/createSdk'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { publisher } from '@latitude-data/core/events/publisher'
import { LogSources } from '@latitude-data/core/constants'

import { User } from '@latitude-data/core/schema/models/types/User'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
const inputSchema = z.object({
  messages: z.array(
    z.object({
      role: z.string(),
      content: z.any(),
    }),
  ),
  mcpHeaders: z.record(z.string(), z.record(z.string(), z.string())).optional(),
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
        const { messages: response, mcpHeaders } = inputSchema.parse(body)
        const documentLogUuid = params.documentLogUuid
        const messages = response as Message[]

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
          mcpHeaders,
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
            { message: 'Invalid input', details: z.treeifyError(error) },
            { status: 400 },
          )
        }

        throw error
      }
    },
  ),
)
