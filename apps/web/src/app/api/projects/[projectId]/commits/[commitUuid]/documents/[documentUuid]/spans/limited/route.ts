import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { DocumentVersionsRepository } from '@latitude-data/core/repositories'
import { computeSpansLimited } from '@latitude-data/core/services/spans/computeSpansLimited'
import { SpanType } from '@latitude-data/constants'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const searchParamsSchema = z.object({
  from: z.string().optional(),
  direction: z.enum(['forward', 'backward']).default('forward'),
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
      const { projectId, commitUuid, documentUuid } = params

      const parsedParams = searchParamsSchema.parse({
        from: searchParams.get('from') ?? undefined,
        type: searchParams.get('type'),
      })

      const repository = new DocumentVersionsRepository(workspace.id)
      await repository
        .getSomeDocumentByUuid({ projectId: Number(projectId), documentUuid })
        .then((r) => r.unwrap())

      const fromCursor = parsedParams.from
        ? JSON.parse(parsedParams.from)
        : null

      const spansResult = await computeSpansLimited({
        documentUuid,
        commitUuid,
        from: fromCursor,
        direction: parsedParams.direction,
        type: parsedParams.type,
      })

      return NextResponse.json(
        {
          items: spansResult.items,
          next: spansResult.next ? JSON.stringify(spansResult.next) : null,
          prev: spansResult.prev ? JSON.stringify(spansResult.prev) : null,
        },
        { status: 200 },
      )
    },
  ),
)
