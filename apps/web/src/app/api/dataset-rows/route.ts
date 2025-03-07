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
      const withCount = searchParams.get('withCount') === 'true'
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

      const rowsRequest = repo.findByDatasetPaginated({
        datasetId: dataset.id,
        page,
        pageSize: pageSize as string | undefined,
      })

      if (!withCount) {
        const rows = await rowsRequest
        return NextResponse.json({ rows, count: 0 }, { status: 200 })
      }

      const countRequest = repo.getCountByDataset(dataset.id)
      const [rows, count] = await Promise.all([rowsRequest, countRequest])

      return NextResponse.json(
        { rows, count: count[0]?.count ?? 0 },
        { status: 200 },
      )
    },
  ),
)
