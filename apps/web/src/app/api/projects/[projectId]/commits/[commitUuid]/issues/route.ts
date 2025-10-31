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
import { parseIssuesQueryParams } from '@latitude-data/constants/issues'

const paramsSchema = z.object({
  projectId: z.coerce.number(),
  commitUuid: z.string(),
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
        }
        workspace: Workspace
      },
    ) => {
      const { projectId, commitUuid } = paramsSchema.parse({
        projectId: params.projectId,
        commitUuid: params.commitUuid,
      })
      const query = request.nextUrl.searchParams
      const parsed = parseIssuesQueryParams({ params: query })
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
      const result = await issuesRepo
        .fetchIssuesFiltered({
          project,
          commit,
          filters: parsed.filters,
          sorting: parsed.sorting,
          page: parsed.page,
          limit: parsed.limit,
        })
        .then((r) => r.unwrap())

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
