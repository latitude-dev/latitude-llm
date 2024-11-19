import { DatasetsRepository } from '@latitude-data/core/repositories'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(async (_req: NextRequest, _res: NextResponse, { workspace }) => {
    const scope = new DatasetsRepository(workspace.id)
    const rows = await scope.findAll().then((r) => r.unwrap())

    return NextResponse.json(rows, { status: 200 })
  }),
)
