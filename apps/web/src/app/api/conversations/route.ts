import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { parseSpansFilters, SpansFilters } from '$/lib/schemas/filters'
import { buildCommitFilter } from '$/app/api/spans/limited/route'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { DEFAULT_PAGINATION_SIZE } from '@latitude-data/core/constants'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import {
  fetchConversations,
  type ConversationListItem,
} from '@latitude-data/core/data-access/conversations/fetchConversations'
import { fetchConversation } from '@latitude-data/core/data-access/conversations/fetchConversation'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export type ConversationsResponse = {
  items: ConversationListItem[]
  next: string | null
  didFallbackToAllTime?: boolean
}

export async function getConversationsForDocument({
  workspace,
  projectId,
  documentUuid,
  commit,
  commitsRepo,
  filters,
  from,
  limit,
}: {
  workspace: Workspace
  projectId: number
  documentUuid: string
  commit: Commit
  commitsRepo: CommitsRepository
  filters: SpansFilters
  from?: { startedAt: string; documentLogUuid: string }
  limit?: number
}): Promise<ConversationsResponse> {
  if (filters.documentLogUuid) {
    const conversationResult = await fetchConversation({
      workspace,
      projectId,
      documentLogUuid: filters.documentLogUuid,
      documentUuid,
    })

    if (!conversationResult.ok || !conversationResult.value) {
      return { items: [], next: null }
    }

    const c = conversationResult.value
    const listItem: ConversationListItem = {
      documentLogUuid: c.documentLogUuid,
      startedAt: c.startedAt,
      endedAt: c.endedAt,
      totalDuration: c.totalDuration ?? 0,
      source: c.source,
      commitUuid: c.commitUuid ?? '',
      experimentUuid: c.experimentUuid,
    }
    return { items: [listItem], next: null }
  }

  const commitUuids = await buildCommitFilter({
    filters: { commitUuids: filters.commitUuids },
    currentCommit: commit,
    commitsRepo,
  })

  const { items, next, didFallbackToAllTime } = await fetchConversations({
    workspace,
    projectId,
    documentUuid,
    filters: {
      commitUuids,
      experimentUuids: filters.experimentUuids,
      testDeploymentIds: filters.testDeploymentIds,
      createdAt: filters.createdAt,
    },
    from,
    limit,
  }).then((r) => r.unwrap())

  return {
    items,
    next: next ? JSON.stringify(next) : null,
    didFallbackToAllTime,
  }
}

const searchParamsSchema = z.object({
  projectId: z.coerce.number(),
  commitUuid: z.string(),
  documentUuid: z.string(),
  from: z.string().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(DEFAULT_PAGINATION_SIZE),
  filters: z.string().optional(),
})

export const GET = errorHandler(
  authHandler(
    async (request: NextRequest, { workspace }: { workspace: Workspace }) => {
      const searchParams = request.nextUrl.searchParams
      const { projectId, commitUuid, documentUuid, from, limit, filters } =
        searchParamsSchema.parse({
          projectId: searchParams.get('projectId') ?? undefined,
          commitUuid: searchParams.get('commitUuid') ?? undefined,
          documentUuid: searchParams.get('documentUuid') ?? undefined,
          from: searchParams.get('from') ?? undefined,
          limit: searchParams.get('limit') ?? undefined,
          filters: searchParams.get('filters') ?? undefined,
        })

      const commitsRepo = new CommitsRepository(workspace.id)
      const commitResult = await commitsRepo.getCommitByUuid({
        uuid: commitUuid,
        projectId,
      })

      if (commitResult.error) {
        return NextResponse.json(
          { message: 'Commit not found' },
          { status: 404 },
        )
      }

      const commit = commitResult.value

      const parsedFilters =
        parseSpansFilters(filters, 'conversations API') ?? {}

      const fromCursor = from ? JSON.parse(from) : undefined

      const response = await getConversationsForDocument({
        workspace,
        projectId,
        documentUuid,
        commit,
        commitsRepo,
        filters: parsedFilters,
        from: fromCursor,
        limit,
      })

      return NextResponse.json(response, { status: 200 })
    },
  ),
)
