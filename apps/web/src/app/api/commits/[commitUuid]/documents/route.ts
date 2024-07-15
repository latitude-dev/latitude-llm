import { materializeDocumentsAtCommit } from '@latitude-data/core'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  req: NextRequest,
  { commitUuid }: { commitUuid: string },
) {
  try {
    const staged = Boolean(req.nextUrl.searchParams.get('staged') || false)
    const nodes = await materializeDocumentsAtCommit({ commitUuid, staged })

    return NextResponse.json(nodes)
  } catch (err: unknown) {
    const error = err as Error
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
