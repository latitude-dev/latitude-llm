import { faker } from '@faker-js/faker'
import { eq } from 'drizzle-orm'

import {
  EvaluationMetadataType,
  Providers,
  User,
  Workspace,
  WorkspaceDto,
} from '../../browser'
import { database } from '../../client'
import { unsafelyGetUser } from '../../data-access'
import { projects } from '../../schema'
import { mergeCommit } from '../../services/commits'
import { createNewDocument, updateDocument } from '../../services/documents'
import { updateProject } from '../../services/projects'
import { createProject as createProjectFn } from '../../services/projects/create'
import { createApiKey } from './apiKeys'
import { createDraft } from './commits'
import {
  createEvaluation,
  createLlmAsJudgeEvaluation,
  IEvaluationData,
} from './evaluations'
import {
  createProviderApiKey,
  defaultProviderFakeData,
} from './providerApiKeys'
import { createWorkspace, type ICreateWorkspace } from './workspaces'
import { DocumentVersionsRepository } from '../../repositories'
import { createIntegration } from '../../services/integrations'
import { IntegrationType } from '@latitude-data/constants'

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
  deletedAt?: Date | null
  workspace?: Workspace | WorkspaceDto | ICreateWorkspace
  providers?: { type: Providers; name: string }[]
  integrations?: string[]
  evaluations?: Omit<IEvaluationData, 'workspace' | 'user'>[]
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
    projectData.evaluations?.map((evaluationData) => {
      if (evaluationData.metadataType === EvaluationMetadataType.Manual) {
        return createEvaluation({
          workspace,
          user,
          ...evaluationData,
          metadataType: EvaluationMetadataType.Manual,
        })
      }
      return createLlmAsJudgeEvaluation({ workspace, user, ...evaluationData })
    }) ?? [],
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
    evaluations,
  }
}

export type FactoryCreateProjectReturn = Awaited<
  ReturnType<typeof createProject>
>
