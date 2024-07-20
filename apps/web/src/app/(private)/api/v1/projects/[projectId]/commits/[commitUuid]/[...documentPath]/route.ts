import {
  CommitsRepository,
  DocumentVersionsRepository,
  ProjectsRepository,
} from '@latitude-data/core'
import apiRoute from '$/helpers/api/route'
import { LatitudeRequest } from '$/middleware'

export async function GET(
  req: LatitudeRequest,
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
    const workspaceId = req.workspaceId!
    const { commitUuid, projectId, documentPath } = params
    const commitsScope = new CommitsRepository(workspaceId)
    const projectsScope = new ProjectsRepository(workspaceId)
    const projectResult = await projectsScope.getProjectById(projectId)
    if (projectResult.error) return projectResult

    const commit = await commitsScope
      .getCommitByUuid({ uuid: commitUuid, project: projectResult.value! })
      .then((r) => r.unwrap())
    const documentVersionsScope = new DocumentVersionsRepository(workspaceId)
    const result = await documentVersionsScope.getDocumentByPath({
      commit,
      path: documentPath.join('/'),
    })
    const document = result.unwrap()

    return Response.json(document)
  })
}
