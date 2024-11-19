import { Ok } from '@latitude-data/core/lib/Result'
import { DatasetsRepository } from '@latitude-data/core/repositories'
import { previewDataset } from '@latitude-data/core/services/datasets/preview'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

type IParam = { datasetId: string }
type ResponseResult = Awaited<ReturnType<typeof previewDataset>>
type PreviewResponse = ResponseResult extends Ok<infer T> ? T : never

export const GET = errorHandler<IParam, PreviewResponse>(
  authHandler<IParam, PreviewResponse>(
    async (_req: NextRequest, _res: NextResponse, { params, workspace }) => {
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
