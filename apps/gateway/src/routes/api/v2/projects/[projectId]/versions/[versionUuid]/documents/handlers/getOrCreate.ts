import { zValidator } from '@hono/zod-validator'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  ProjectsRepository,
  UsersRepository,
} from '@latitude-data/core/repositories'
import { createNewDocument } from '@latitude-data/core/services/documents/create'
import { documentPresenter } from '$/presenters/documentPresenter'
import { Factory } from 'hono/factory'
import { z } from 'zod'

const factory = new Factory()

const runSchema = z.object({
  path: z.string(),
  prompt: z.string().optional(),
})

export const getOrCreateHandler = factory.createHandlers(
  zValidator('json', runSchema),
  async (c) => {
    const workspace = c.get('workspace')
    const { projectId, versionUuid } = c.req.param()
    const { path, prompt } = c.req.valid('json')

    const usersScope = new UsersRepository(workspace.id)
    const projectsScope = new ProjectsRepository(workspace.id)
    const commitsScope = new CommitsRepository(workspace.id)
    const docsScope = new DocumentVersionsRepository(workspace.id)

    const project = await projectsScope
      .getProjectById(Number(projectId!))
      .then((r) => r.unwrap())

    const commit = await commitsScope
      .getCommitByUuid({
        projectId: project.id,
        uuid: versionUuid!,
      })
      .then((r) => r.unwrap())

    const docResult = await docsScope.getDocumentByPath({ commit, path: path })
    if (docResult.ok) return c.json(await documentPresenter(docResult.value!))

    // We create the document as the first user in the workspace,
    // because on the API we don't have a user actor.
    const user = await usersScope.findFirst().then((r) => r.unwrap())

    const document = await createNewDocument({
      workspace,
      user: user!,
      commit: commit,
      path,
      content: prompt,
    }).then((r) => r.unwrap())

    return c.json(await documentPresenter(document))
  },
)
