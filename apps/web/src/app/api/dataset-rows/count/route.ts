import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { Workspace } from '@latitude-data/core/browser'
import {
  DatasetRowsRepository,
  DatasetsRepository,
} from '@latitude-data/core/repositories'
import { NextRequest, NextResponse } from 'next/server'

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
      const repo = new DatasetRowsRepository(workspace.id)
      const resultCount = await repo.getCountByDataset(dataset.id)
      const count = !resultCount[0] ? 0 : resultCount[0].count

      return NextResponse.json(count, { status: 200 })
    },
  ),
)
