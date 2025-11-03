import { createSdk } from '$/app/(private)/_lib/createSdk'
import { captureException } from '$/helpers/captureException'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { StreamEventTypes } from '@latitude-data/constants'
import { LogSources } from '@latitude-data/core/constants'
import { publisher } from '@latitude-data/core/events/publisher'
import { createSSEStream } from '@latitude-data/core/lib/createSSEStream'
import { Result } from '@latitude-data/core/lib/Result'
import { PromisedResult } from '@latitude-data/core/lib/Transaction'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'

import { scanDocumentContent } from '@latitude-data/core/services/documents/scan'
import { User } from '@latitude-data/core/schema/models/types/User'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { env } from '@latitude-data/env'
import {
  ChainEventDto,
  GenerationResponse,
  LatitudeApiError,
} from '@latitude-data/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const inputSchema = z.object({
  path: z.string(),
  commitUuid: z.string(),
  parameters: z.record(z.string(), z.any()),
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
        const commitsScope = new CommitsRepository(workspace.id)
        const headCommit = await commitsScope.getHeadCommit(projectId)

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

        const { readable, write, writeError, closeWriter } = createSSEStream()
        const onEvent = (event: {
          event: StreamEventTypes
          data: ChainEventDto
        }) => write(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`) // prettier-ignore
        const onError = async (error: LatitudeApiError) => {
          await writeError(error)
          await closeWriter()
        }
        const onFinished = async (_data: GenerationResponse) => {
          await write(
            `event: finished\ndata: ${JSON.stringify({ success: true })}\n\n`,
          )
          await closeWriter()
        }

        try {
          const result = await sdk.prompts.run(path, {
            background: true,
            versionUuid: commitUuid,
            parameters,
            userMessage,
          })
          if (!result?.uuid) throw new Error('Failed to create run')

          sdk.runs.attach(result.uuid, {
            stream: true,
            onEvent,
            onError,
            onFinished,
            signal: req.signal,
          })
        } catch (error) {
          captureException(error as Error)
          await writeError(new Error('Failed to execute prompt'))
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
        // When client closes the connection, the SDK will throw an undefined
        // error or AbortError which we can safely ignore
        if (!error || (error as Error).name === 'AbortError') return
        if (error instanceof z.ZodError) {
          return NextResponse.json(
            {
              message: 'Invalid input',
              details: z.treeifyError(error),
            },
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
}): PromisedResult<Record<string, unknown>> {
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

    const sdk = await createSdk({
      workspace: workspace,
      apiKey: env.COPILOT_WORKSPACE_API_KEY!,
      projectId: env.COPILOT_PROJECT_ID,
      __internal: { source: LogSources.Copilot },
    }).then((r) => r.unwrap())

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

    // we return the response wrapped within a parameter_record key
    const response = result?.response?.object.parameter_record as Record<
      string,
      unknown
    >

    return Result.ok(response ?? {})
  } catch (error) {
    return Result.error(error as Error)
  }
}
