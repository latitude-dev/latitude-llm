import { Workspace } from '@latitude-data/core/browser'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import {
  DatasetRowsRepository,
  DatasetsV2Repository,
} from '@latitude-data/core/repositories'

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
      const repo = new DatasetRowsRepository(workspace.id)
      const count = await repo.getCountByDataset(dataset.id)

      return NextResponse.json(count, { status: 200 })
    },
  ),
)
