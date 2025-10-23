import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { SpansRepository } from '@latitude-data/core/repositories'
import { SpanType } from '@latitude-data/constants'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const searchParamsSchema = z.object({
  cursor: z.string().optional().default(''),
  limit: z.coerce.number().min(1).max(100).default(50),
  type: z
    .enum(Object.values(SpanType) as [string, ...string[]])
    .default(SpanType.Prompt),
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
      const parsedParams = searchParamsSchema.parse({
        cursor: searchParams.get('cursor'),
        limit: searchParams.get('limit'),
        type: searchParams.get('type'),
      })

      const { commitUuid, documentUuid } = params

      // Parse cursor if provided
      let cursor: { startedAt: Date; id: string } | undefined
      if (parsedParams.cursor) {
        try {
          const decoded = JSON.parse(atob(parsedParams.cursor))
          cursor = {
            startedAt: new Date(decoded.startedAt),
            id: decoded.id,
          }
        } catch {
          return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 })
        }
      }

      const spansRepository = new SpansRepository(workspace.id)
      const result = await spansRepository.findByDocumentAndCommit({
        documentUuid,
        commitUuid,
        type: parsedParams.type as SpanType,
        cursor,
        limit: parsedParams.limit,
      })

      if (result.error) {
        return NextResponse.json(
          { error: 'Failed to fetch spans' },
          { status: 500 },
        )
      }

      const { spans, hasMore, nextCursor } = result.value

      // Encode next cursor for client
      const nextCursorEncoded = nextCursor
        ? btoa(
            JSON.stringify({
              startedAt: nextCursor.startedAt.toISOString(),
              id: nextCursor.id,
            }),
          )
        : null

      return NextResponse.json(
        {
          spans,
          hasMore,
          nextCursor: nextCursorEncoded,
        },
        { status: 200 },
      )
    },
  ),
)
