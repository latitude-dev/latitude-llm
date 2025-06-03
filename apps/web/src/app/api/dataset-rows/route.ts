import { DEFAULT_PAGINATION_SIZE, Workspace } from '@latitude-data/core/browser'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import {
  DatasetRowsRepository,
  DatasetsRepository,
} from '@latitude-data/core/repositories'
import { parsePositiveNumber } from '@latitude-data/core/services/documentLogs/logsFilterUtils/parseApiLogFilterParams'

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
      const datasetRepo = new DatasetsRepository(workspace.id)
      const result = await datasetRepo.find(Number(datasetId))

      if (result.error) {
        return NextResponse.json(
          { message: `Dataset not found with id: ${datasetId}` },
          { status: 404 },
        )
      }

      const dataset = result.value
      const page = parsePositiveNumber(searchParams.get('page'), 1)
      const pageSize = parsePositiveNumber(
        searchParams.get('pageSize'),
        DEFAULT_PAGINATION_SIZE,
      )

      const repo = new DatasetRowsRepository(workspace.id)
      const rows = await repo.findByDatasetPaginated({
        datasetId: dataset.id,
        page,
        pageSize,
      })

      return NextResponse.json(rows, { status: 200 })
    },
  ),
)
