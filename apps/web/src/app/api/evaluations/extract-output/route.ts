import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { Message } from '@latitude-data/constants/messages'
import {
  CompletionSpanMetadata,
  CompletionSpanTokens,
  MAIN_SPAN_TYPES,
  PromptSpanMetadata,
} from '@latitude-data/core/constants'
import {
  EvaluationsV2Repository,
  SpanMetadatasRepository,
  SpansRepository,
} from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { buildEvaluationParameters } from '@latitude-data/core/services/evaluationsV2/llm/shared'
import { extractActualOutput } from '@latitude-data/core/services/evaluationsV2/outputs/extract'
import { findFirstSpanOfType } from '@latitude-data/core/services/tracing/spans/fetching/findFirstSpanOfType'
import { assembleTraceWithMessages } from '@latitude-data/core/services/tracing/traces/assemble'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export type ExtractOutputResponse =
  | {
      ok: true
      actualOutput: string
      conversation: string
      tokens: CompletionSpanTokens
      cost: number
      duration: number
      prompt: string
      parameters: Record<string, unknown>
    }
  | {
      ok: false
      error: string
    }

const queryParamsSchema = z.object({
  documentLogUuid: z.string(),
  evaluationUuid: z.string(),
  commitUuid: z.string(),
  documentUuid: z.string(),
})

export const GET = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        workspace,
      }: {
        workspace: Workspace
      },
    ) => {
      const searchParams = req.nextUrl.searchParams
      const { documentLogUuid, evaluationUuid, commitUuid, documentUuid } =
        queryParamsSchema.parse({
          documentLogUuid: searchParams.get('documentLogUuid'),
          evaluationUuid: searchParams.get('evaluationUuid'),
          commitUuid: searchParams.get('commitUuid'),
          documentUuid: searchParams.get('documentUuid'),
        })

      const spansRepository = new SpansRepository(workspace.id)
      const traceId = await spansRepository.getLastTraceByLogUuid(
        documentLogUuid,
        { commitUuid, documentUuid },
      )

      if (!traceId) {
        return NextResponse.json(
          { ok: false, error: 'No trace found for document log' },
          { status: 200 },
        )
      }

      const { trace, completionSpan } = await assembleTraceWithMessages({
        traceId,
        workspace,
      }).then((r) => r.unwrap())

      if (!completionSpan || !completionSpan.metadata) {
        return NextResponse.json(
          { ok: false, error: 'No completion span found' },
          { status: 200 },
        )
      }

      const mainTypes = Array.from(MAIN_SPAN_TYPES)
      const promptSpan = findFirstSpanOfType(trace.children, mainTypes)
      if (!promptSpan) {
        return NextResponse.json(
          { ok: false, error: 'No prompt span found' },
          { status: 200 },
        )
      }

      const metadatasRepository = new SpanMetadatasRepository(workspace.id)
      const promptMetadata = (await metadatasRepository
        .get({ spanId: promptSpan.id, traceId: promptSpan.traceId })
        .then((r) => r.unwrap())) as PromptSpanMetadata | undefined
      if (promptMetadata) {
        promptSpan.metadata = promptMetadata
      }

      const completionSpanMetadata =
        completionSpan.metadata as CompletionSpanMetadata

      if (
        !completionSpanMetadata.output ||
        completionSpanMetadata.output.length === 0
      ) {
        return NextResponse.json(
          { ok: false, error: 'Completion span has no output messages' },
          { status: 200 },
        )
      }

      const conversation = [
        ...completionSpanMetadata.input,
        ...completionSpanMetadata.output,
      ] as unknown as Message[]

      const evaluationsRepo = new EvaluationsV2Repository(workspace.id)
      const evaluation = await evaluationsRepo
        .getAtCommitByDocument({
          commitUuid,
          documentUuid,
          evaluationUuid,
        })
        .then((r) => r.unwrap())

      const actualOutputResult = extractActualOutput({
        conversation,
        configuration: evaluation.configuration.actualOutput,
      })
      if (actualOutputResult.error) {
        return NextResponse.json(
          {
            ok: false,
            error: `Failed to extract actual output: ${actualOutputResult.error.message}`,
          },
          { status: 200 },
        )
      }
      const actualOutput = actualOutputResult.value

      const parameters = buildEvaluationParameters({
        span: promptSpan,
        completionSpan: completionSpan,
        actualOutput: actualOutput,
        conversation: conversation,
      })

      return NextResponse.json({ ok: true, ...parameters }, { status: 200 })
    },
  ),
)
