import { materializeDocumentsAtCommit } from '@latitude-data/core'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _: NextRequest,
  {
    params: { commitUuid, projectId },
  }: { params: { commitUuid: string; projectId: number } },
) {
  try {
    const documents = await materializeDocumentsAtCommit({
      commitUuid,
      projectId: Number(projectId),
    })

    return NextResponse.json(documents.unwrap())
  } catch (err: unknown) {
    const error = err as Error
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
