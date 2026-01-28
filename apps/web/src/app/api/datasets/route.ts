import { DatasetsRepository } from '@latitude-data/core/repositories'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { parsePage } from '@latitude-data/core/data-access/experiments/parseApiExperimentsFilterParams'
import { DEFAULT_PAGINATION_SIZE } from '@latitude-data/core/constants'
import { createDataset } from '@latitude-data/core/services/datasets/create'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { User } from '@latitude-data/core/schema/models/types/User'

export const GET = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        workspace,
      }: {
        workspace: Workspace
      },
    ) => {
      const searchParams = req.nextUrl.searchParams
      const page = parsePage(searchParams.get('page'))
      const pageSize =
        searchParams.get('pageSize') ?? String(DEFAULT_PAGINATION_SIZE)
      const scope = new DatasetsRepository(workspace.id)
      const rows = await scope.findAllPaginated({
        page,
        pageSize,
      })

      return NextResponse.json(rows, { status: 200 })
    },
  ),
)

export const POST = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        workspace,
        user,
      }: {
        workspace: Workspace
        user: User
      },
    ) => {
      const body = await req.json()
      const { name, columns } = body

      if (!name || !columns) {
        return NextResponse.json(
          { message: 'Name and columns are required' },
          { status: 400 },
        )
      }

      const result = await createDataset({
        author: user,
        workspace,
        data: {
          name,
          columns,
        },
      })

      if (result.error) {
        return NextResponse.json(
          { message: result.error.message },
          { status: 400 },
        )
      }

      return NextResponse.json(result.value, { status: 201 })
    },
  ),
)
