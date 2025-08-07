import { faker } from '@faker-js/faker'

import type { DocumentVersion, User, Workspace } from '../../browser'
import { unsafelyGetUser } from '../../data-access'
import { mergeCommit } from '../../services/commits'
import { createNewDocument, updateDocument } from '../../services/documents'
import { createProject as createProjectFn } from '../../services/projects'
import { createDraft } from './commits'
import { flattenDocumentStructure, type ICreateProject } from './projects'
import { createWorkspace } from './workspaces'

export async function createProject(projectData: Partial<ICreateProject> = {}) {
  const workspaceData = projectData.workspace ?? {}
  let user: User
  let workspace: Workspace

  if ('id' in workspaceData) {
    user = (await unsafelyGetUser(workspaceData.creatorId!)) as User
    workspace = workspaceData as Workspace
  } else {
    const newWorkspace = await createWorkspace(workspaceData)
    workspace = newWorkspace.workspace
    user = newWorkspace.userData
  }

  const randomName = faker.commerce.department()
  const { name } = projectData

  const result = await createProjectFn({
    name: name ?? randomName,
    workspace,
    user,
  })
  const { project, commit: c } = result.unwrap()
  let commit = c

  const documents: DocumentVersion[] = []

  if (projectData.documents) {
    const documentsToCreate = await flattenDocumentStructure({
      documents: projectData.documents,
    })
    const { commit: draft } = await createDraft({ project, user })
    for await (const { path, content } of documentsToCreate) {
      const newDoc = await createNewDocument({
        commit: draft,
        path,
        user,
        workspace,
      }).then((r) => r.unwrap())
      const updatedDoc = await updateDocument({
        commit: draft,
        document: newDoc,
        content,
      })
      documents.push(updatedDoc.unwrap())
    }
    commit = await mergeCommit(draft).then((r) => r.unwrap())
  }

  return { project, user, workspace, documents, commit: commit! }
}
