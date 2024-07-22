import { getDocumentByPath } from '@latitude-data/core'
import apiRoute from '$/helpers/api/route'
import { NextRequest } from 'next/server'

export async function GET(
  _: NextRequest,
  {
    params,
  }: {
    params: {
      commitUuid: string
      projectId: number
      documentPath: string[]
    }
  },
) {
  return apiRoute(async () => {
    const { projectId, commitUuid, documentPath } = params

    const result = await getDocumentByPath({
      projectId: Number(projectId),
      commitUuid,
      path: documentPath.join('/'),
    })
    const document = result.unwrap()

    return Response.json(document)
  })
}
