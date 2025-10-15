import { createSdk } from '$/app/(private)/_lib/createSdk'
import { captureException } from '$/helpers/captureException'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { LogSources } from '@latitude-data/constants'
import { createSSEStream } from '@latitude-data/core/lib/createSSEStream'

import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
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
        const { readable, write, writeError, closeWriter } = createSSEStream()

        try {
          sdk.runs.attach(runUuid, {
            stream: true,
            signal: req.signal,
            onEvent: (event) => write(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`), // prettier-ignore
            onError: async (error) => {
              await writeError(error)
              await closeWriter()
            },
            onFinished: async () => {
              await write(`event: finished\ndata: ${JSON.stringify({ success: true })}\n\n`) // prettier-ignore
              await closeWriter()
            },
          })
        } catch (error) {
          captureException(error as Error)
          await writeError(new Error('Failed to attach run'))
          await closeWriter()
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
