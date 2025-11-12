import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  SpansRepository,
} from '@latitude-data/core/repositories'
import { SpanType } from '@latitude-data/constants'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { parseSpansFilters } from '$/lib/schemas/filters'

const searchParamsSchema = z.object({
  from: z.string().optional(),
  type: z
    .enum(Object.values(SpanType) as [string, ...string[]])
    .default(SpanType.Prompt),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  filters: z.string().optional(), // JSON string containing filters
})

export const GET = errorHandler(
  authHandler(
    async (
      request: NextRequest,
      {
        params,
        workspace,
      }: {
        params: {
          projectId: string
          commitUuid: string
          documentUuid: string
        }
        workspace: Workspace
      },
    ) => {
      const searchParams = request.nextUrl.searchParams
      const { projectId, commitUuid, documentUuid } = params

      const parsedParams = searchParamsSchema.parse({
        from: searchParams.get('from') ?? undefined,
        type: searchParams.get('type'),
        limit: searchParams.get('limit'),
        filters: searchParams.get('filters') ?? undefined,
      })

      // Parse filters if present
      const filters =
        parseSpansFilters(parsedParams.filters, 'spans limited API') || {}

      const commitsRepo = new CommitsRepository(workspace.id)
      const headCommit = await commitsRepo.getHeadCommit(Number(projectId))
      const repository = new DocumentVersionsRepository(workspace.id)
      await repository
        .getSomeDocumentByUuid({ projectId: Number(projectId), documentUuid })
        .then((r) => r.unwrap())

      const fromCursor = parsedParams.from
        ? JSON.parse(parsedParams.from)
        : null

      let spansResult

      if (filters.traceId) {
        // If traceId is present in filters, fetch spans for that specific trace
        const spansRepository = new SpansRepository(workspace.id)
        const spans = await spansRepository
          .list({ traceId: filters.traceId })
          .then((r) =>
            r.unwrap().filter((span) => span.type === SpanType.Prompt),
          )
        spansResult = {
          items: spans,
          count: spans.length,
          next: null,
        }
      } else {
        // Otherwise, fetch spans directly from the repository
        const spansRepository = new SpansRepository(workspace.id)
        const resultCount = await spansRepository.approximateCount({
          documentUuid,
          commitUuid: headCommit?.uuid === commitUuid ? undefined : commitUuid,
          type: parsedParams.type as SpanType,
          commitUuids: filters.commitUuids,
          experimentUuids: filters.experimentUuids,
          createdAt: filters.createdAt,
        })
        const result = await spansRepository.findByDocumentAndCommitLimited({
          documentUuid,
          commitUuid: headCommit?.uuid === commitUuid ? undefined : commitUuid,
          type: parsedParams.type as SpanType,
          from: fromCursor
            ? { startedAt: fromCursor.value, id: fromCursor.id }
            : undefined,
          limit: parsedParams.limit,
          commitUuids: filters.commitUuids,
          experimentUuids: filters.experimentUuids,
          createdAt: filters.createdAt,
        })

        const { items, next } = result.unwrap()

        spansResult = {
          items,
          count: resultCount.value,
          next: next ? { value: next.startedAt, id: next.id } : null,
        }
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
