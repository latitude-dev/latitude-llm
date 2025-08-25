import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import type { Workspace } from '@latitude-data/core/browser'
import { DatasetRowsRepository } from '@latitude-data/core/repositories'
import { type NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        params: { id },
        workspace,
      }: {
        params: {
          id: string
        }
        workspace: Workspace
      },
    ) => {
      const searchParams = req.nextUrl.searchParams
      const datasetId = searchParams.get('datasetId')
      const pageSize = searchParams.get('pageSize')

      const repo = new DatasetRowsRepository(workspace.id)
      const result = await repo.fetchDatasetRowWithPosition({
        datasetId: Number(datasetId),
        datasetRowId: Number(id),
        pageSize: Number(pageSize ?? 0) || undefined,
      })

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
