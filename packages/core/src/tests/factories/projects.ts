import { faker } from '@faker-js/faker'

import { DocumentVersion, Providers, User, Workspace } from '../../browser'
import { unsafelyGetUser } from '../../data-access'
import { mergeCommit } from '../../services/commits'
import { createNewDocument, updateDocument } from '../../services/documents'
import { createProject as createProjectFn } from '../../services/projects/create'
import { createApiKey } from './apiKeys'
import { createDraft } from './commits'
import { createLlmAsJudgeEvaluation, IEvaluationData } from './evaluations'
import { createProviderApiKey } from './providerApiKeys'
import { createWorkspace, type ICreateWorkspace } from './workspaces'

export type IDocumentStructure = { [key: string]: string | IDocumentStructure }

export async function flattenDocumentStructure({
  currentPath = '',
  documents,
}: {
  currentPath?: string
  documents: IDocumentStructure
}): Promise<{ path: string; content: string }[]> {
  const result: { path: string; content: string }[] = []

  for (const [key, value] of Object.entries(documents)) {
    const childPath = currentPath ? `${currentPath}/${key}` : key
    if (typeof value === 'string') {
      result.push({ path: childPath, content: value })
    } else {
      const nested = await flattenDocumentStructure({
        currentPath: childPath,
        documents: value,
      })
      result.push(...nested)
    }
  }

  return result
}

export type ICreateProject = {
  name?: string
  workspace?: Workspace | ICreateWorkspace
  providers?: { type: Providers; name: string }[]
  evaluations?: Omit<IEvaluationData, 'workspace'>[]
  documents?: IDocumentStructure
  skipMerge?: boolean
}
export async function createProject(projectData: Partial<ICreateProject> = {}) {
  const skipMerge = projectData.skipMerge ?? false
  let workspaceData = projectData.workspace ?? {}
  let user: User
  let workspace: Workspace

  if ('id' in workspaceData) {
    user = (await unsafelyGetUser(workspaceData.creatorId!)) as User
    workspace = workspaceData as Workspace
  } else {
    const newWorkspace = await createWorkspace(workspaceData)
    workspace = newWorkspace.workspace
    user = newWorkspace.userData

    await createApiKey({ workspace })
  }

  const randomName = faker.commerce.department()
  const { name } = projectData

  const result = await createProjectFn({
    name: name ?? randomName,
    workspace,
    user,
    mergedAt: new Date(),
  })
  let { project, commit } = result.unwrap()

  const providersToCreate =
    projectData.providers == undefined
      ? [{ type: Providers.OpenAI, name: faker.internet.domainName() }]
      : projectData.providers
  const providers = await Promise.all(
    providersToCreate.map(({ type, name }) =>
      createProviderApiKey({
        workspace,
        user,
        type,
        name,
      }),
    ) ?? [],
  )

  const evaluations = await Promise.all(
    projectData.evaluations?.map((evaluationData) =>
      createLlmAsJudgeEvaluation({ workspace, ...evaluationData }),
    ) ?? [],
  )

  const documents: DocumentVersion[] = []

  if (projectData.documents) {
    const documentsToCreate = await flattenDocumentStructure({
      documents: projectData.documents,
    })
    const { commit: draft } = await createDraft({ project, user })
    for await (const { path, content } of documentsToCreate) {
      const newDoc = await createNewDocument({ commit: draft, path }).then(
        (r) => r.unwrap(),
      )
      const updatedDoc = await updateDocument({
        commit: draft,
        document: newDoc,
        content,
      })
      documents.push(updatedDoc.unwrap())
    }

    commit = skipMerge
      ? commit
      : await mergeCommit(draft).then((r) => r.unwrap())
  }

  return {
    project,
    user,
    workspace,
    providers,
    documents,
    commit: commit,
    evaluations,
  }
}
