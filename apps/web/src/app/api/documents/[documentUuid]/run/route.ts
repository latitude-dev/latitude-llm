import { createSdk } from '$/app/(private)/_lib/createSdk'
import { captureException } from '$/helpers/captureException'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { ChainEventTypes } from '@latitude-data/constants'
import {
  LogSources,
  StreamEventTypes,
  User,
  Workspace,
} from '@latitude-data/core/browser'
import { publisher } from '@latitude-data/core/events/publisher'
import { Result } from '@latitude-data/core/lib/Result'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { scanDocumentContent } from '@latitude-data/core/services/documents/scan'
import { isFeatureEnabledByName } from '@latitude-data/core/services/workspaceFeatures/isFeatureEnabledByName'
import { env } from '@latitude-data/env'
import {
  ChainEventDto,
  GenerationResponse,
  Latitude,
  LatitudeApiError,
} from '@latitude-data/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

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

        const runsEnabled = await isFeatureEnabledByName(
          workspace.id,
          'runs',
        ).then((r) => r.unwrap())

        const commitsScope = new CommitsRepository(workspace.id)
        const headCommit = await commitsScope
          .getHeadCommit(projectId)
          .then((r) => r.unwrap())

        // Publish document run event
        publisher.publishLater({
          type: 'documentRunRequested',
          data: {
            projectId,
            commitUuid,
            isLiveCommit: headCommit?.uuid === commitUuid,
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

        // Create a TransformStream to handle the streaming response
        const { readable, writable } = new TransformStream()
        const writer = writable.getWriter()
        const encoder = new TextEncoder()

        // Track if the writer has been closed to prevent multiple close attempts
        let isWriterClosed = false

        // Helper function to safely close the writer
        const safeCloseWriter = async () => {
          if (!isWriterClosed) {
            isWriterClosed = true
            try {
              await writer.close()
            } catch (error) {
              // do nothion, writer might be closed already
            }
          }
        }

        // Helper function to write error to stream
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

        // Set up abort handler and store the handler function for later removal
        const abortHandler = () => {
          writer.abort()
        }
        req.signal.addEventListener('abort', abortHandler)

        const onEvent = async (event: {
          event: StreamEventTypes
          data: ChainEventDto
        }) => {
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
        }

        const onError = async (error: LatitudeApiError) => {
          captureException(error)

          await writeErrorToStream(error)
        }

        const onFinished = async (_data: GenerationResponse) => {
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
        }

        try {
          if (runsEnabled) {
            const result = await sdk.prompts.run(path, {
              background: true,
              versionUuid: commitUuid,
              parameters,
              userMessage,
            })
            if (!result?.uuid) {
              throw new Error('Failed to create run')
            }

            sdk.runs.attach(result.uuid, {
              stream: true,
              interactive: true,
              onEvent,
              onError,
              onFinished,
              signal: req.signal,
            })
          } else {
            sdk.prompts.run(path, {
              stream: true,
              background: false,
              versionUuid: commitUuid,
              parameters,
              userMessage,
              onEvent,
              onError,
              onFinished,
              signal: req.signal,
            })
          }
        } catch (error) {
          captureException(error as Error)
          await writeErrorToStream(new Error('Failed to execute prompt'))
        } finally {
          // Clean up the abort event listener
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
    const sdk = new Latitude(env.COPILOT_WORKSPACE_API_KEY!, {
      projectId: env.COPILOT_PROJECT_ID,
    })
    const { parameters } = await scanDocumentContent({ document, commit }).then(
      (r) => r.unwrap(),
    )
    const result = await sdk.prompts.run<Record<string, unknown>>(
      'other/simulation/parameters', // TODO: env var
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
