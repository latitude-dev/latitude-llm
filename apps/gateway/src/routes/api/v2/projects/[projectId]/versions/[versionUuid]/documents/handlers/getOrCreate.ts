import { zValidator } from '@hono/zod-validator'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  ProjectsRepository,
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

    const document = await createNewDocument({
      workspace,
      commit: commit,
      path,
      content: prompt,
    }).then((r) => r.unwrap())

    return c.json(await documentPresenter(document))
  },
)
