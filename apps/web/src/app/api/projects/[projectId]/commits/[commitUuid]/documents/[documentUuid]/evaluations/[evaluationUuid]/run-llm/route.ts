import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { captureException } from '$/helpers/captureException'
import {
  ChainEventTypes,
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetric,
  LlmEvaluationMetricAnyCustom,
} from '@latitude-data/constants'
import { EvaluationsV2Repository } from '@latitude-data/core/repositories'
import { buildStreamEvaluationRun } from '@latitude-data/core/services/evaluationsV2/llm/buildStreamEvaluationRun'
import { WorkspaceDto } from '@latitude-data/core/schema/models/types/Workspace'
import {
  NotFoundError,
  UnprocessableEntityError,
} from '@latitude-data/core/lib/errors'

function isCustomLlmEvaluation(
  evaluation: EvaluationV2,
): evaluation is EvaluationV2<
  EvaluationType.Llm,
  LlmEvaluationMetricAnyCustom
> {
  const metric = evaluation.metric
  return (
    evaluation.type === EvaluationType.Llm &&
    (metric === LlmEvaluationMetric.Custom ||
      metric === LlmEvaluationMetric.CustomLabeled)
  )
}

const buildSelfCloseWriter =
  ({
    writer,
    isWriterClosed,
  }: {
    writer: WritableStreamDefaultWriter<any>
    isWriterClosed: boolean
  }) =>
  async () => {
    if (!isWriterClosed) {
      isWriterClosed = true
      try {
        await writer.close()
      } catch (error) {
        captureException(error as Error)
      }
    }
  }

const buildWriteErrorToStream =
  ({
    encoder,
    writer,
    safeCloseWriter,
  }: {
    encoder: TextEncoder
    writer: WritableStreamDefaultWriter<any>
    safeCloseWriter: () => Promise<void>
  }) =>
  async (error: Error | unknown) => {
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

const inputSchema = z.object({
  parameters: z.record(z.string(), z.any()),
})

export const POST = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        workspace,
        params,
      }: {
        params: {
          projectId: number
          commitUuid: string
          documentUuid: string
          evaluationUuid: string
        }
        workspace: WorkspaceDto
      },
    ) => {
      const { projectId, commitUuid, documentUuid, evaluationUuid } = params
      const repository = new EvaluationsV2Repository(workspace.id)
      const body = await req.json()

      const result = await repository.getAtCommitByDocument({
        projectId,
        commitUuid,
        documentUuid,
        evaluationUuid,
      })

      if (result.error) {
        throw new NotFoundError('Evaluation not found')
      }

      const evaluation = result.value

      if (!isCustomLlmEvaluation(evaluation)) {
        throw new UnprocessableEntityError(
          'Only custom LLM evaluations can be ran on the playground',
        )
      }

      try {
        const { parameters } = inputSchema.parse(body)
        const { streamHandler } = await buildStreamEvaluationRun({
          workspace,
          evaluation,
          parameters,
        }).then((r) => r.unwrap())

        // Create a TransformStream to handle the streaming response
        const { readable, writable } = new TransformStream()
        const writer = writable.getWriter()
        const encoder = new TextEncoder()
        const isWriterClosed = false
        const safeCloseWriter = buildSelfCloseWriter({ writer, isWriterClosed })
        const writeErrorToStream = buildWriteErrorToStream({
          encoder,
          writer,
          safeCloseWriter,
        })

        const abortHandler = () => {
          writer.abort()
        }

        req.signal.addEventListener('abort', abortHandler)

        try {
          streamHandler({
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
            signal: req.signal,
          })
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
          throw new UnprocessableEntityError(
            'Invalid input',
            error.flatten().fieldErrors,
          )
        }

        // When client closes the connection, the SDK will throw an undefined
        // error or AbortError which we can safely ignore
        if (!error || (error as Error).name === 'AbortError') return

        throw error
      }
    },
  ),
)
