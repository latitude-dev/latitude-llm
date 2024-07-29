import {
  CommitsRepository,
  DocumentVersionsRepository,
  ProjectsRepository,
} from '@latitude-data/core'
import { LatitudeRequest } from '$/middleware'
import { NextResponse } from 'next/server'

export async function GET(
  req: LatitudeRequest,
  {
    params: { commitUuid, projectId },
  }: { params: { commitUuid: string; projectId: number } },
) {
  try {
    const workspaceId = req.workspaceId!
    const scope = new DocumentVersionsRepository(workspaceId)
    const commitsScope = new CommitsRepository(workspaceId)
    const projectsScope = new ProjectsRepository(workspaceId)
    const project = await projectsScope
      .getProjectById(projectId)
      .then((r) => r.unwrap())
    const commit = await commitsScope
      .getCommitByUuid({ uuid: commitUuid, project })
      .then((r) => r.unwrap())
    const documents = await scope.getDocumentsAtCommit({ commit })

    return NextResponse.json(documents.unwrap())
  } catch (err: unknown) {
    const error = err as Error
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
