import { materializeDocumentsAtCommit } from '@latitude-data/core'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _: NextRequest,
  { commitUuid, projectId }: { commitUuid: string; projectId: number },
) {
  try {
    const documents = await materializeDocumentsAtCommit({
      commitUuid,
      projectId,
    })

    return NextResponse.json(documents)
  } catch (err: unknown) {
    const error = err as Error
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
