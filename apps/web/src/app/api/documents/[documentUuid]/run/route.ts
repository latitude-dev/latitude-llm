import { LogSources, User, Workspace } from '@latitude-data/core/browser'

import { createSdk } from '$/app/(private)/_lib/createSdk'
import { publisher } from '@latitude-data/core/events/publisher'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { captureException } from '$/helpers/captureException'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { ChainEventTypes } from '@latitude-data/constants'
import { Latitude } from '@latitude-data/sdk'
import { env } from '@latitude-data/env'
import { scanDocumentContent } from '@latitude-data/core/services/documents/scan'
import { Result } from '@latitude-data/core/lib/Result'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'

const inputSchema = z.object({
  path: z.string(),
  commitUuid: z.string(),
  parameters: z.record(z.any()),
  stream: z.boolean().default(true),
  userMessage: z.string().optional(),
  aiParameters: z.boolean().optional(),
})

export const POST = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        workspace,
        user,
      }: {
        workspace: Workspace
        user: User
      },
    ) => {
      try {
        const body = await req.json()
        const {
          path,
          commitUuid,
          parameters: _parameters,
          userMessage,
          aiParameters,
        } = inputSchema.parse(body)
        const projectId = Number(body.projectId)

        publisher.publishLater({
          type: 'documentRunRequested',
          data: {
            projectId,
            commitUuid,
            documentPath: path,
            parameters: _parameters,
            workspaceId: workspace.id,
            userEmail: user.email,
            userMessage,
          },
        })

        const parameters = aiParameters
          ? await generateAIParameters({
              workspace,
              commitUuid,
              projectId,
              path,
            }).then((r) => r.unwrap())
          : _parameters

        const sdk = await createSdk({
          workspace,
          projectId,
          __internal: { source: LogSources.Playground },
        }).then((r) => r.unwrap())

        return createStreamingResponse(
          sdk,
          path,
          commitUuid,
          parameters,
          userMessage,
          req,
        )
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

async function createStreamingResponse(
  sdk: any,
  path: string,
  commitUuid: string,
  parameters: Record<string, any>,
  userMessage: string | undefined,
  req: NextRequest,
) {
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()
  let isWriterClosed = false

  const safeCloseWriter = async () => {
    if (!isWriterClosed) {
      isWriterClosed = true
      try {
        await writer.close()
      } catch {
        // Writer might be closed already
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
    sdk.prompts.run(path, {
      stream: true,
      background: true,
      versionUuid: commitUuid,
      parameters,
      userMessage,
      onEvent: async (event: any) => {
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
          await writeErrorToStream(new Error('Failed to write to stream'))
        }
      },
      onError: async (error: any) => {
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
      signal: req.signal,
    })
  } catch (error) {
    captureException(error as Error)
    await writeErrorToStream(new Error('Failed to execute prompt'))
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
}

async function generateAIParameters({
  workspace,
  commitUuid,
  projectId,
  path,
}: {
  workspace: Workspace
  commitUuid: string
  projectId: number
  path: string
}) {
  try {
    const commit = await new CommitsRepository(workspace.id)
      .getCommitByUuid({ uuid: commitUuid, projectId })
      .then((r) => r.unwrap())
    const document = await new DocumentVersionsRepository(workspace.id)
      .getDocumentByPath({
        commit,
        path,
      })
      .then((r) => r.unwrap())
    const sdk = new Latitude('82d43d82-0ec3-41b5-a3ea-230f5a3e25ed', {
      projectId: 60,
      versionUuid: 'df024917-2061-4e49-9a15-a697a0bda6e7',
      __internal: {
        gateway: {
          host: 'gateway.latitude.so',
          port: 443,
          ssl: true,
        },
      },
    })
    const { parameters } = await scanDocumentContent({ document, commit }).then(
      (r) => r.unwrap(),
    )
    const result = await sdk.prompts.run<Record<string, unknown>>(
      'other/simulation/parameters',
      {
        parameters: {
          prompt_template: document.content,
          parameters_list: JSON.stringify(Array.from(parameters)),
        },
        stream: false,
      },
    )

    return Result.ok(result?.response?.object)
  } catch (error) {
    return Result.error(error as Error)
  }
}
