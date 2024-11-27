import { zValidator } from '@hono/zod-validator'
import { Commit, Workspace } from '@latitude-data/core/browser'
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

async function getOrCreateDocument({
  workspace,
  commit,
  path,
  content,
}: {
  workspace: Workspace
  commit: Commit
  path: string
  content?: string
}) {
  const docsScope = new DocumentVersionsRepository(workspace.id)
  const docResult = await docsScope.getDocumentByPath({ commit, path: path })
  if (docResult.ok) return docResult.unwrap()

  return await createNewDocument({
    workspace,
    commit,
    path,
    content,
  }).then((r) => r.unwrap())
}

export const getOrCreateHandler = factory.createHandlers(
  zValidator('json', runSchema),
  async (c) => {
    const workspace = c.get('workspace')
    const { projectId, versionUuid } = c.req.param()
    const { path, prompt } = c.req.valid('json')

    const projectsScope = new ProjectsRepository(workspace.id)
    const commitsScope = new CommitsRepository(workspace.id)

    const project = await projectsScope
      .getProjectById(Number(projectId!))
      .then((r) => r.unwrap())

    const commit = await commitsScope
      .getCommitByUuid({
        projectId: project.id,
        uuid: versionUuid!,
      })
      .then((r) => r.unwrap())

    const document = await getOrCreateDocument({
      workspace,
      commit,
      path,
      content: prompt,
    })

    return c.json(
      await documentPresenter({
        document,
        commit,
        workspace,
      }),
    )
  },
)
