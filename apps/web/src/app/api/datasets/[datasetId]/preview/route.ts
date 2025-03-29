import { Workspace } from '@latitude-data/core'
import { DatasetsRepository } from '@latitude-data/core'
import { previewDataset } from '@latitude-data/core'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        params,
        workspace,
      }: {
        params: { datasetId: number }
        workspace: Workspace
      },
    ) => {
      const { datasetId } = params
      const repo = new DatasetsRepository(workspace.id)
      const dataset = await repo.find(datasetId).then((r) => r.unwrap())
      const preview = await previewDataset({
        dataset,
        prependIndex: true,
      }).then((r) => r.unwrap())

      return NextResponse.json(preview, { status: 200 })
    },
  ),
)
