import ROUTES from '$/common/routes'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  ProjectsRepository,
} from '$core/repositories'
import { Hono } from 'hono'

const router = new Hono()

router.get(ROUTES.Api.V1.Documents.Get, async (c) => {
  const workspace = c.get('workspace')
  // @ts-expect-error - hono cannot infer the params type from the route path
  // unless you explicitely write it in the handler
  const { projectId, commitUuid, documentPath } = c.req.param()

  // scopes
  const projectsScope = new ProjectsRepository(workspace.id)
  const commitsScope = new CommitsRepository(workspace.id)
  const docsScope = new DocumentVersionsRepository(workspace.id)

  // get project, commit, and document
  const project = await projectsScope
    .getProjectById(projectId)
    .then((r) => r.unwrap())
  const commit = await commitsScope
    .getCommitByUuid({ project, uuid: commitUuid })
    .then((r) => r.unwrap())
  const document = await docsScope
    .getDocumentByPath({
      commit,
      path: '/' + documentPath,
    })
    .then((r) => r.unwrap())

  return c.json(document)
})

export { router as documentsRouter }
