import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { listApps } from '@latitude-data/core/services/integrations/pipedream/apps'

export const GET = errorHandler(
  authHandler(async (request: NextRequest) => {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('query') || undefined
    const cursor = searchParams.get('cursor') || undefined
    const withTriggers = searchParams.get('withTriggers') === 'true'
    const result = await listApps({ query, cursor, withTriggers })

    return NextResponse.json(result.unwrap(), { status: 200 })
  }),
)
