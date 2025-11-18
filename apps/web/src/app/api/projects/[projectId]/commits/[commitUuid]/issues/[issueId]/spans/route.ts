import { z } from 'zod'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import {
  ProjectsRepository,
  IssuesRepository,
  EvaluationResultsV2Repository,
  SpansRepository,
} from '@latitude-data/core/repositories'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'
import { calculateOffset } from '@latitude-data/core/lib/pagination/index'
import { OkType } from '@latitude-data/core/lib/Result'

type SpanResponse = OkType<SpansRepository['findBySpanAndTraceIds']>
export type IssueSpansResponse = {
  spans: SpanResponse
  hasNextPage: boolean
}

const paramsSchema = z.object({
  projectId: z.coerce.number(),
  commitUuid: z.string(),
  issueId: z.coerce.number(),
})

const querySchema = z.object({
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(25),
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
        page: request.nextUrl.searchParams.get('page') ?? '1',
        pageSize: request.nextUrl.searchParams.get('pageSize') ?? '25',
      })

      const projectsRepo = new ProjectsRepository(workspace.id)
      const project = await projectsRepo.find(projectId).then((r) => r.unwrap())

      const commitsRepo = new CommitsRepository(workspace.id)
      const commit = await commitsRepo
        .getCommitByUuid({
          projectId,
          uuid: commitUuid,
        })
        .then((r) => r.unwrap())

      const issuesRepo = new IssuesRepository(workspace.id)
      const issue = await issuesRepo.findById({
        project,
        issueId,
      })

      if (!issue) {
        return NextResponse.json(
          { message: 'Issue not found' },
          { status: 404 },
        )
      }

      const evaluationResultsRepo = new EvaluationResultsV2Repository(
        workspace.id,
      )

      // Fetch one extra result to determine if there's a next page
      const limit = query.pageSize + 1
      const offset = calculateOffset(query.page, query.pageSize)

      const results = await evaluationResultsRepo.listByIssueWithDetails({
        issue,
        commit,
        limit,
        offset,
      })

      const hasNextPage = results.length > query.pageSize
      const returnResults = hasNextPage
        ? results.slice(0, query.pageSize)
        : results

      const spansRepo = new SpansRepository(workspace.id)
      const spans = await spansRepo.findBySpanAndTraceIds(
        returnResults.map((r) => ({
          spanId: r.evaluatedSpanId!,
          traceId: r.evaluatedTraceId!,
        })),
      )

      return NextResponse.json(
        {
          spans: spans.unwrap(),
          hasNextPage,
        },
        { status: 200 },
      )
    },
  ),
)
