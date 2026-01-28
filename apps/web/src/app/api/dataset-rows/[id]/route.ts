import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import {
  DatasetRowsRepository,
  DatasetsRepository,
} from '@latitude-data/core/repositories'
import { updateDatasetRow } from '@latitude-data/core/services/datasetRows/update'
import { deleteManyRows } from '@latitude-data/core/services/datasetRows/deleteManyRows'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'

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
      const repo = new DatasetRowsRepository(workspace.id)
      const row = await repo.find(id).then((r) => r.unwrap())

      return NextResponse.json(row, { status: 200 })
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
      const { rowData, datasetId } = body

      if (!rowData || !datasetId) {
        return NextResponse.json(
          { message: 'rowData and datasetId are required' },
          { status: 400 },
        )
      }

      const datasetRepo = new DatasetsRepository(workspace.id)
      const datasetResult = await datasetRepo.find(Number(datasetId))

      if (datasetResult.error) {
        return NextResponse.json(
          { message: 'Dataset not found' },
          { status: 404 },
        )
      }

      const rowRepo = new DatasetRowsRepository(workspace.id)
      const rowResult = await rowRepo.find(id)

      if (rowResult.error) {
        return NextResponse.json(
          { message: 'Dataset row not found' },
          { status: 404 },
        )
      }

      const result = await updateDatasetRow({
        dataset: datasetResult.value,
        data: {
          rows: [
            {
              rowId: Number(id),
              rowData,
            },
          ],
        },
      })

      if (result.error) {
        return NextResponse.json(
          { message: result.error.message },
          { status: 400 },
        )
      }

      return NextResponse.json(result.value[0], { status: 200 })
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
      const rowRepo = new DatasetRowsRepository(workspace.id)
      const rowResult = await rowRepo.find(id)

      if (rowResult.error) {
        return NextResponse.json(
          { message: 'Dataset row not found' },
          { status: 404 },
        )
      }

      const row = rowResult.value
      const datasetRepo = new DatasetsRepository(workspace.id)
      const datasetResult = await datasetRepo.find(row.datasetId)

      if (datasetResult.error) {
        return NextResponse.json(
          { message: 'Dataset not found' },
          { status: 404 },
        )
      }

      const result = await deleteManyRows({
        dataset: datasetResult.value,
        rows: [row],
      })

      if (result.error) {
        return NextResponse.json(
          { message: result.error.message },
          { status: 400 },
        )
      }

      return NextResponse.json(result.value[0], { status: 200 })
    },
  ),
)
