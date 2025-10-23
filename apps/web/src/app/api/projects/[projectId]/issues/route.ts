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
import { HEAD_COMMIT } from '@latitude-data/constants'
import { issuesFiltersQueryParamsParser } from '@latitude-data/core/data-access/issues/parseFilters'

const paramsSchema = z.object({ projectId: z.coerce.number() })

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
        }
        workspace: Workspace
      },
    ) => {
      const { projectId } = paramsSchema.parse({ projectId: params.projectId })
      const query = request.nextUrl.searchParams
      const commitUuid = query.get('commitUuid') ?? HEAD_COMMIT
      const parsed = issuesFiltersQueryParamsParser.parse(query)
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
          cursor: parsed.cursor,
          limit: parsed.limit,
        })
        .then((r) => r.unwrap())

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
