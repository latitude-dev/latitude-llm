import { z } from 'zod'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import {
  ProjectsRepository,
  IssuesRepository,
} from '@latitude-data/core/repositories'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'
import { OkType } from '@latitude-data/core/lib/Result'
import { getSpansByIssue } from '@latitude-data/core/data-access/issues/getSpansByIssue'

export type IssueSpansResponse = OkType<typeof getSpansByIssue>

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
      const data = await getSpansByIssue({
        workspace,
        commit,
        issue,
        page: query.page,
        pageSize: query.pageSize,
      }).then((r) => r.unwrap())

      return NextResponse.json(data, { status: 200 })
    },
  ),
)
