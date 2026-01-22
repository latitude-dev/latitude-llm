import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import {
  CommitsRepository,
  SpansRepository,
} from '@latitude-data/core/repositories'
import { isMainSpan, LogSources, MAIN_SPAN_TYPES, SpanType } from '@latitude-data/constants'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { parseSpansFilters } from '$/lib/schemas/filters'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DEFAULT_PAGINATION_SIZE } from '@latitude-data/core/constants'

const searchParamsSchema = z.object({
  projectId: z.string(),
  commitUuid: z.string().optional(),
  documentUuid: z.string().optional(),
  from: z.string().optional(),
  types: z.string().optional(), // Comma-separated list of span types
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(DEFAULT_PAGINATION_SIZE),
  filters: z.string().optional(), // JSON string containing filters
  source: z.string().optional(),
})

export const GET = errorHandler(
  authHandler(
    async (request: NextRequest, { workspace }: { workspace: Workspace }) => {
      const searchParams = request.nextUrl.searchParams
      const parsedParams = searchParamsSchema.parse({
        projectId: searchParams.get('projectId') ?? undefined,
        commitUuid: searchParams.get('commitUuid') ?? undefined,
        documentUuid: searchParams.get('documentUuid') ?? undefined,
        from: searchParams.get('from') ?? undefined,
        types: searchParams.get('types') ?? undefined,
        limit: searchParams.get('limit') ?? undefined,
        filters: searchParams.get('filters') ?? undefined,
        source: searchParams.get('source') ?? undefined,
      })
      const { projectId, commitUuid, documentUuid } = parsedParams

      const types = (parsedParams.types?.split(',') as SpanType[]) ??
        Array.from(MAIN_SPAN_TYPES)

      // Parse filters if present
      const filters =
        parseSpansFilters(parsedParams.filters, 'spans limited API') || {}

      const commitsRepo = new CommitsRepository(workspace.id)
      const fromCursor = parsedParams.from
        ? JSON.parse(parsedParams.from)
        : null

      let spansResult
      const spansRepository = new SpansRepository(workspace.id)

      if (filters.documentLogUuid) {
        const spansRepository = new SpansRepository(workspace.id)
        const spans = await spansRepository.listByDocumentLogUuid(
          filters.documentLogUuid,
        )
        spansResult = {
          items: spans.filter(isMainSpan),
          count: spans.length,
          next: null,
        }
      } else {
        let result: { items: any[]; next: any } = { items: [], next: null }

        if (documentUuid) {
          if (!commitUuid) {
            return NextResponse.json(
              { error: 'commitUuid is required when documentUuid is provided' },
              { status: 400 },
            )
          }
          const currentCommit = await commitsRepo
            .getCommitByUuid({ uuid: commitUuid, projectId: Number(projectId) })
            .then((r) => r.unwrap())
          result = await spansRepository
            .findByDocumentAndCommitLimited({
              documentUuid,
              types,
              from: fromCursor
                ? { startedAt: fromCursor.value, id: fromCursor.id }
                : undefined,
              limit: parsedParams.limit,
              commitUuids: await buildCommitFilter({
                filters,
                currentCommit,
                commitsRepo,
              }),
              experimentUuids: filters.experimentUuids,
              createdAt: filters.createdAt,
            })
            .then((r) => r.unwrap())
        } else {
          // Project-level query (commitUuid optional)
          result = await spansRepository
            .findByProjectLimited({
              projectId: Number(projectId),
              types,
              limit: parsedParams.limit,
              source: parsedParams.source?.split(',') as LogSources[],
              from: fromCursor
                ? { startedAt: fromCursor.value, id: fromCursor.id }
                : undefined,
              createdAt: filters.createdAt,
            })
            .then((r) => r.unwrap())
        }

        spansResult = {
          items: result.items,
          count: null,
          next: result.next
            ? { value: result.next.startedAt, id: result.next.id }
            : null,
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

export async function buildCommitFilter({
  filters = {},
  currentCommit,
  commitsRepo,
}: {
  filters?: { commitUuids?: string[] }
  currentCommit: Commit
  commitsRepo: CommitsRepository
}): Promise<string[]> {
  if (filters.commitUuids) return filters.commitUuids

  const commits = await commitsRepo
    .getCommitsHistory({ commit: currentCommit })
    .then((commits) => {
      return commits.map((commit) => commit.uuid)
    })
    .catch(() => [])

  return commits
}
