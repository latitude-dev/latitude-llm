import { faker } from '@faker-js/faker'
import { eq } from 'drizzle-orm'

import { IntegrationType } from '@latitude-data/constants'
import { Providers } from '@latitude-data/constants'
import { WorkspaceDto } from '../../schema/models/types/Workspace'
import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import { database } from '../../client'
import { DocumentVersionsRepository } from '../../repositories'
import { projects } from '../../schema/models/projects'
import { mergeCommit } from '../../services/commits'
import { createNewDocument, updateDocument } from '../../services/documents'
import { createIntegration } from '../../services/integrations'
import { updateProject } from '../../services/projects'
import { createProject as createProjectFn } from '../../services/projects/create'
import { createApiKey } from './apiKeys'
import { createDraft } from './commits'
import {
  createProviderApiKey,
  defaultProviderFakeData,
} from './providerApiKeys'
import { createWorkspace, type ICreateWorkspace } from './workspaces'
import { ProviderConfiguration } from '../../schema/models/providerApiKeys'
import { ApiKey } from '../../schema/models/types/ApiKey'
import { unsafelyFindUserById } from '../../queries/users/findById'

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

type IProviderData<T extends Providers> = {
  type: T
  name: string
  defaultModel?: string
  configuration?: ProviderConfiguration<T>
}

export type ICreateProject = {
  name?: string
  deletedAt?: Date | null
  workspace?: Workspace | WorkspaceDto | ICreateWorkspace
  providers?: IProviderData<Providers>[]
  integrations?: string[]
  documents?: IDocumentStructure
  skipMerge?: boolean
}
export async function createProject(projectData: Partial<ICreateProject> = {}) {
  const skipMerge = projectData.skipMerge ?? false
  const workspaceData = projectData.workspace ?? {}
  let user: User
  let workspace: WorkspaceDto
  let apiKeys: ApiKey[] = []

  if ('id' in workspaceData) {
    user = (await unsafelyFindUserById({ id: workspaceData.creatorId! }))!
    workspace = workspaceData as WorkspaceDto
  } else {
    const newWorkspace = await createWorkspace(workspaceData)
    workspace = newWorkspace.workspace
    user = newWorkspace.userData

    const { apiKey } = await createApiKey({ workspace })

    apiKeys = [apiKey]
  }

  if (projectData.integrations?.length) {
    await Promise.all(
      projectData.integrations.map((name) =>
        createIntegration({
          workspace,
          name,
          type: IntegrationType.ExternalMCP,
          configuration: {
            url: 'https://custom.mcp/sse',
          },
          author: user,
        }),
      ),
    )
  }

  const randomName = faker.commerce.department()
  const { name } = projectData

  const result = await createProjectFn({
    name: name ?? randomName,
    workspace,
    user,
    mergedAt: skipMerge ? undefined : new Date(),
  })
  let { project, commit } = result.unwrap()

  // Tests run within a transaction and the NOW() PostgreSQL function returns
  // the transaction start time. Therefore, all projects would be created
  // at the same time, messing with tests. This code patches this.
  project = await database
    .update(projects)
    .set({ createdAt: new Date() })
    .where(eq(projects.id, project.id))
    .returning()
    .then((p) => p[0]!)

  if (projectData.deletedAt)
    await updateProject(project, { deletedAt: projectData.deletedAt }).then(
      (r) => r.unwrap(),
    )

  const providersToCreate =
    projectData.providers == undefined
      ? [defaultProviderFakeData()]
      : projectData.providers
  const providers = await Promise.all(
    providersToCreate.map(({ type, name, defaultModel, configuration }) =>
      createProviderApiKey({
        workspace,
        user,
        type,
        name,
        defaultModel,
        configuration,
      }),
    ) ?? [],
  )

  if (projectData.documents) {
    const documentsToCreate = await flattenDocumentStructure({
      documents: projectData.documents,
    })
    const { commit: draft } = await createDraft({ project, user })
    for await (const { path, content } of documentsToCreate) {
      const newDoc = await createNewDocument({
        workspace,
        user,
        commit: draft,
        path,
      }).then((r) => r.unwrap())
      await updateDocument({
        commit: draft,
        document: newDoc,
        content,
      })
    }

    commit = skipMerge
      ? draft
      : await mergeCommit(draft).then((r) => r.unwrap())
  }

  const docRepo = new DocumentVersionsRepository(workspace.id)

  // Fresh documents after merge
  const documents = await docRepo
    .getDocumentsAtCommit(commit)
    .then((r) => r.unwrap())

  return {
    project,
    user,
    workspace,
    providers,
    documents,
    commit,
    apiKeys,
  }
}

export type FactoryCreateProjectReturn = Awaited<
  ReturnType<typeof createProject>
>
