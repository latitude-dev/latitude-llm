import { DEFAULT_PAGINATION_SIZE, Workspace } from '@latitude-data/core/browser'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import {
  DatasetRowsRepository,
  DatasetsV2Repository,
} from '@latitude-data/core/repositories'
import { parsePage } from '@latitude-data/core/services/documentLogs/index'

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
      const datasetId = searchParams.get('datasetId')
      const datasetRepo = new DatasetsV2Repository(workspace.id)
      const result = await datasetRepo.find(Number(datasetId))

      if (result.error) {
        return NextResponse.json(
          { message: `Dataset not found with id: ${datasetId}` },
          { status: 404 },
        )
      }

      const dataset = result.value
      const page = parsePage(searchParams.get('page'))
      const pageSize =
        searchParams.get('pageSize') ?? String(DEFAULT_PAGINATION_SIZE)
      const repo = new DatasetRowsRepository(workspace.id)
      const rows = await repo.findByDatasetPaginated({
        datasetId: dataset.id,
        page,
        pageSize: pageSize as string | undefined,
      })

      return NextResponse.json(rows, { status: 200 })
    },
  ),
)
