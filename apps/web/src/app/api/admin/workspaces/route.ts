import { findAllWorkspacesForAdmin } from '@latitude-data/core/services/workspaces/findAllForAdmin'
import { errorHandler } from '$/middlewares/errorHandler'
import { adminHandler } from '$/middlewares/adminHandler'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  adminHandler(async (_: NextRequest) => {
    const result = await findAllWorkspacesForAdmin()
    const workspaces = result.unwrap()

    return NextResponse.json(workspaces, { status: 200 })
  }),
)
