import { and, eq, isNull } from 'drizzle-orm'
import {
  Commit,
  DocumentVersion,
  findFirstModelForProvider,
  User,
  Workspace,
} from '../../browser'
import { database } from '../../client'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import { ProjectsRepository } from '../../repositories'
import { createProject } from '../projects/create'
import { findDefaultProvider } from '../providerApiKeys/findDefaultProvider'
import { createNewDocument } from './create'
import { buildDocuments } from './forkDocument/buildDocuments'
import { getIncludedDocuments } from './forkDocument/getIncludedDocuments'

type ForkProps = {
  title: string
  prefix?: string
  origin: {
    workspace: Workspace
    commit: Commit
    document: DocumentVersion
  }
  destination: {
    workspace: Workspace
    user: User
  }
  defaultProviderName?: string
}
const ATTEMPTS_BEFORE_RANDOM_SUFFIX = 4
async function createProjectFromDocument({
  title,
  prefix,
  workspace,
  user,
}: {
  title: string
  prefix: string
  workspace: Workspace
  user: User
}) {
  const baseName = `${prefix} ${title}`
  let name = baseName
  const repo = new ProjectsRepository(workspace.id)
  let attempts = 0

  while (attempts < ATTEMPTS_BEFORE_RANDOM_SUFFIX) {
    const result = await database
      .select()
      .from(repo.scope)
      .where(
        and(
          eq(repo.scope._.selectedFields.workspaceId, workspace.id),
          eq(repo.scope._.selectedFields.name, name),
          isNull(repo.scope._.selectedFields.deletedAt),
        ),
      )
      .limit(1)

    if (result.length === 0) {
      return createProject({ name, workspace, user })
    }

    attempts++
    name = `${baseName} (${attempts})`
  }

  const randomSuffix = Math.floor(Math.random() * 1000)
  name = `${baseName} #${randomSuffix}`

  return createProject({ name, workspace, user })
}

async function createDocuments({
  origin,
  destination,
}: {
  origin: ForkProps['origin']
  destination: {
    workspace: Workspace
    user: User
    commit: Commit
    providerData: {
      providerName: string | undefined
      modelName: string | undefined
    }
  }
}) {
  const documents = await getIncludedDocuments({
    workspace: origin.workspace,
    commit: origin.commit,
    document: origin.document,
  }).then((r) => r.unwrap())

  const docsData = await buildDocuments({
    origin: { documents },
    destination: {
      commit: destination.commit,
      providerData: destination.providerData,
    },
  })

  const newDocs = await Promise.all(
    docsData.map(async (docData) =>
      createNewDocument({
        workspace: destination.workspace,
        ...docData,
        user: destination.user,
        commit: destination.commit,
        createDemoEvaluation: true,
      }),
    ),
  )

  if (newDocs.some((r) => r.error)) {
    const result = newDocs.find((r) => r.error)
    const error = result!.error!
    return Result.error(
      new Error(`Failed to create documents: ${error.message}`),
    )
  }

  const docs = newDocs.map((r) => r.value).filter((d) => d !== undefined)
  const copiedDocument = docs.find((d) => d.path === origin.document.path)!

  return Result.ok({ documents: docs, copiedDocument })
}

export async function forkDocument({
  title,
  prefix = 'Copy of',
  origin,
  destination,
  defaultProviderName,
}: ForkProps) {
  const { commit, project } = await createProjectFromDocument({
    title,
    prefix,
    workspace: destination.workspace,
    user: destination.user,
  }).then((r) => r.unwrap())

  const provider = await findDefaultProvider(destination.workspace).then((r) =>
    r.unwrap(),
  )
  const model = findFirstModelForProvider({
    provider,
    defaultProviderName,
  })

  publisher.publishLater({
    type: 'forkDocumentRequested',
    data: {
      origin: {
        workspaceId: origin.workspace.id,
        commitUuid: origin.commit.uuid,
        documentUuid: origin.document.documentUuid,
      },
      destination: {
        workspaceId: destination.workspace.id,
        userEmail: destination.user.email,
      },
    },
  })

  const { copiedDocument } = await createDocuments({
    origin,
    destination: {
      workspace: destination.workspace,
      user: destination.user,
      commit,
      providerData: {
        providerName: provider?.name,
        modelName: model,
      },
    },
  }).then((r) => r.unwrap())

  return Result.ok({ project, commit, document: copiedDocument })
}
