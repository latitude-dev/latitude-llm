import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import {
  CommitsRepository,
  SpansRepository,
} from '@latitude-data/core/repositories'
import {
  Span,
  SpanType,
  LIVE_EVALUABLE_SPAN_TYPES,
} from '@latitude-data/core/constants'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { buildEvaluatedSpan } from '@latitude-data/core/data-access/evaluations/buildEvaluatedSpan'
import { OkType } from '@latitude-data/core/lib/Result'

const searchParamsSchema = z.object({
  projectId: z.string().transform((val) => Number(val)),
  commitUuid: z.string(),
  documentUuid: z.string(),
  configuration: z.string(),
  from: z.string().optional(),
})

type EvaluatedSpan = Awaited<OkType<typeof buildEvaluatedSpan>>
export type EvaluatedSpansResponse = {
  items: EvaluatedSpan[]
  count: number | null
  next: string | null
}

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
      const parsedParams = searchParamsSchema.parse({
        projectId: searchParams.get('projectId'),
        commitUuid: searchParams.get('commitUuid'),
        documentUuid: searchParams.get('documentUuid'),
        configuration: searchParams.get('configuration'),
        from: searchParams.get('from') ?? undefined,
      })
      const fromCursor = parsedParams.from
        ? JSON.parse(parsedParams.from)
        : null

      const commitsRepo = new CommitsRepository(workspace.id)
      const commit = await commitsRepo
        .getCommitByUuid({
          projectId: parsedParams.projectId,
          uuid: parsedParams.commitUuid,
        })
        .then((r) => r.unwrap())

      const commits = await commitsRepo.getCommitsHistory({ commit })
      const commitUuids = commits.map((c) => c.uuid)
      const repo = new SpansRepository(workspace.id)
      const result = await repo
        .findByDocumentAndCommitLimited({
          documentUuid: parsedParams.documentUuid,
          commitUuids,
          types: LIVE_EVALUABLE_SPAN_TYPES,
          from: fromCursor
            ? { startedAt: fromCursor.value, id: fromCursor.id }
            : undefined,
          limit: 1,
        })
        .then((r) => r.value)

      const span = result.items[0]

      if (!span) {
        return NextResponse.json(
          { items: [], count: 0, next: null },
          { status: 200 },
        )
      }

      const promptSpan = span as unknown as Span<SpanType.Prompt>
      const evaluatedSpan = await buildEvaluatedSpan({
        span: promptSpan,
        workspace,
        maybeConfiguration: searchParams.get('configuration'),
      }).then((r) => r.unwrap())

      const spansResult = {
        items: [evaluatedSpan],
        count: null,
        next: result.next
          ? { value: result.next.startedAt, id: result.next.id }
          : null,
      }

      return NextResponse.json(
        {
          items: spansResult.items,
          count: spansResult.count,
          next: spansResult.next ? JSON.stringify(spansResult.next) : null,
        },
        { status: 200 },
      )
    },
  ),
)
