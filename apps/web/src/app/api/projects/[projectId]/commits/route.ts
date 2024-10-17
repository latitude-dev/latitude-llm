import {
  CommitStatus,
  ULTRA_LARGE_PAGE_SIZE,
  Workspace,
} from '@latitude-data/core/browser'
import {
  BadRequestError,
  NotFoundError,
  paginateQuery,
} from '@latitude-data/core/lib/index'
import {
  CommitsRepository,
  ProjectsRepository,
} from '@latitude-data/core/repositories'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        params,
        workspace,
      }: {
        params: {
          projectId: number
          page?: number
          pageSize?: number
        }
        workspace: Workspace
      },
    ) => {
      const { projectId } = params
      if (!projectId) {
        throw new BadRequestError('Project ID is required')
      }

      const searchParams = req.nextUrl.searchParams
      const status = searchParams.get('status') as CommitStatus | undefined
      const projectsScope = new ProjectsRepository(workspace.id)
      const result = await projectsScope.find(projectId)
      if (result.error) throw new NotFoundError('Project not found')

      const project = result.value!
      const repo = new CommitsRepository(workspace.id)
      const { rows } = await paginateQuery({
        dynamicQuery: repo
          .getCommitsByProjectQuery({
            project,
            filterByStatus: status,
          })
          .$dynamic(),
        defaultPaginate: {
          pageSize: ULTRA_LARGE_PAGE_SIZE,
        },
      })

      return NextResponse.json(rows, { status: 200 })
    },
  ),
)
