import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { Span, SpanType } from '@latitude-data/constants'
import { getSpansByIssue } from '@latitude-data/core/queries/issues/getSpansByIssue'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { findProjectById } from '@latitude-data/core/queries/projects/findById'
import { findIssueById } from '@latitude-data/core/queries/issues/findById'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { Cursor } from '@latitude-data/core/schema/types'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export type IssueSpansResponse = {
  spans: Span<SpanType.Prompt>[]
  next: string | null
}

const paramsSchema = z.object({
  projectId: z.coerce.number(),
  commitUuid: z.string(),
  issueId: z.coerce.number(),
})

const querySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
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
          issueId: string
        }
        workspace: Workspace
      },
    ) => {
      const { projectId, commitUuid, issueId } = paramsSchema.parse({
        projectId: params.projectId,
        commitUuid: params.commitUuid,
        issueId: params.issueId,
      })

      const query = querySchema.parse({
        cursor: request.nextUrl.searchParams.get('cursor') ?? undefined,
        limit: request.nextUrl.searchParams.get('limit') ?? undefined,
      })

      const parsedCursor = query.cursor ? JSON.parse(query.cursor) : null
      const cursor: Cursor<string, string> | null = parsedCursor
        ? {
            value: parsedCursor.value,
            id: parsedCursor.id,
          }
        : null

      const project = await findProjectById({
        workspaceId: workspace.id,
        id: projectId,
      })
      if (!project) throw new NotFoundError('Project not found')
      const commitsRepo = new CommitsRepository(workspace.id)
      const commit = await commitsRepo
        .getCommitByUuid({
          projectId,
          uuid: commitUuid,
        })
        .then((r) => r.unwrap())

      const issue = await findIssueById({
        workspaceId: workspace.id,
        project,
        issueId,
      })

      if (!issue) {
        return NextResponse.json(
          { message: 'Issue not found' },
          { status: 404 },
        )
      }
      const data = await getSpansByIssue({
        workspace,
        commit,
        issue,
        cursor,
        limit: query.limit,
      }).then((r) => r.unwrap())

      // Serialize cursor for response (same pattern as spans/limited route)
      return NextResponse.json(
        {
          spans: data.spans,
          next: data.next ? JSON.stringify(data.next) : null,
        },
        { status: 200 },
      )
    },
  ),
)
