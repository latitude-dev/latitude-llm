import { Workspace } from '@latitude-data/core/browser'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { DatasetRowsRepository } from '@latitude-data/core/repositories'

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
      const repo = new DatasetRowsRepository(workspace.id)
      const result = await repo.fetchDatasetRowWithPosition({
        datasetId: Number(datasetId),
        datasetRowId: Number(id),
      })

      if (result.error) {
        return NextResponse.json(
          { message: `Dataset Row not found with id: ${id}` },
          { status: 404 },
        )
      }

      return NextResponse.json(result.value, { status: 200 })
    },
  ),
)
