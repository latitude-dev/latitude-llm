import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { listApps } from '@latitude-data/core/services/integrations/pipedream/apps'

export const GET = errorHandler(
  authHandler(async (request: NextRequest) => {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('query') ?? undefined
    const cursor = searchParams.get('cursor') ?? undefined

    const result = await listApps({
      query,
      cursor,
    })

    return NextResponse.json(result.unwrap(), { status: 200 })
  }),
)
