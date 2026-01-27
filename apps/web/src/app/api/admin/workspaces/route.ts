import { findAllWorkspacesForAdmin } from '@latitude-data/core/services/workspaces/findAllForAdmin'
import { searchWorkspacesForAdmin } from '@latitude-data/core/services/workspaces/searchForAdmin'
import { errorHandler } from '$/middlewares/errorHandler'
import { adminHandler } from '$/middlewares/adminHandler'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  adminHandler(async (request: NextRequest) => {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q')

    if (query && query.trim()) {
      const result = await searchWorkspacesForAdmin(query.trim())
      const workspaces = result.unwrap()
      return NextResponse.json(workspaces, { status: 200 })
    }

    const result = await findAllWorkspacesForAdmin()
    const workspaces = result.unwrap()

    return NextResponse.json(workspaces, { status: 200 })
  }),
)
