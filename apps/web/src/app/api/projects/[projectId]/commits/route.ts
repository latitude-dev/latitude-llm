import { CommitsRepository } from '@latitude-data/core/repositories'
import { findProjectById } from '@latitude-data/core/queries/projects/findById'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { BadRequestError, NotFoundError } from '@latitude-data/core/lib/errors'
import { paginateQuery } from '@latitude-data/core/lib/pagination/paginate'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import {
  CommitStatus,
  ULTRA_LARGE_PAGE_SIZE,
} from '@latitude-data/core/constants'

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
      const project = await findProjectById({
        workspaceId: workspace.id,
        id: projectId,
      })
      if (!project) throw new NotFoundError('Project not found')
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
