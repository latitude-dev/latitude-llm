import {
  unifiedSearchForAdmin,
  SearchEntityType,
} from '$/data-access/admin'
import { errorHandler } from '$/middlewares/errorHandler'
import { adminHandler } from '$/middlewares/adminHandler'
import { NextRequest, NextResponse } from 'next/server'

const MIN_QUERY_LENGTH = 2
const EMPTY_RESPONSE = { users: [], workspaces: [], projects: [] }

export const GET = errorHandler(
  adminHandler(async (request: NextRequest) => {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q') || ''
    const entityType = (searchParams.get('type') || 'all') as SearchEntityType
    const trimmedQuery = query.trim()

    if (trimmedQuery.length < MIN_QUERY_LENGTH) {
      return NextResponse.json(EMPTY_RESPONSE, { status: 200 })
    }

    const result = await unifiedSearchForAdmin(trimmedQuery, entityType)
    const data = result.unwrap()

    return NextResponse.json(data, { status: 200 })
  }),
)
