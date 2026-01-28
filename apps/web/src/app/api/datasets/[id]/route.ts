import { DatasetsRepository } from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { updateDataset } from '@latitude-data/core/services/datasets/update'
import { destroyDataset } from '@latitude-data/core/services/datasets/destroy'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        params,
        workspace,
      }: {
        params: { id: string }
        workspace: Workspace
      },
    ) => {
      const { id } = params
      const scope = new DatasetsRepository(workspace.id)
      const dataset = await scope.find(id).then((r) => r.unwrap())

      return NextResponse.json(dataset, { status: 200 })
    },
  ),
)

export const PUT = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        params,
        workspace,
      }: {
        params: { id: string }
        workspace: Workspace
      },
    ) => {
      const { id } = params
      const body = await req.json()
      const { columns } = body

      if (!columns) {
        return NextResponse.json(
          { message: 'Columns are required' },
          { status: 400 },
        )
      }

      const scope = new DatasetsRepository(workspace.id)
      const datasetResult = await scope.find(id)

      if (datasetResult.error) {
        return NextResponse.json(
          { message: 'Dataset not found' },
          { status: 404 },
        )
      }

      const result = await updateDataset({
        dataset: datasetResult.value,
        data: { columns },
      })

      if (result.error) {
        return NextResponse.json(
          { message: result.error.message },
          { status: 400 },
        )
      }

      return NextResponse.json(result.value, { status: 200 })
    },
  ),
)

export const DELETE = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        params,
        workspace,
      }: {
        params: { id: string }
        workspace: Workspace
      },
    ) => {
      const { id } = params
      const scope = new DatasetsRepository(workspace.id)
      const datasetResult = await scope.find(id)

      if (datasetResult.error) {
        return NextResponse.json(
          { message: 'Dataset not found' },
          { status: 404 },
        )
      }

      const result = await destroyDataset({
        dataset: datasetResult.value,
      })

      if (result.error) {
        return NextResponse.json(
          { message: result.error.message },
          { status: 400 },
        )
      }

      return NextResponse.json(result.value, { status: 200 })
    },
  ),
)
