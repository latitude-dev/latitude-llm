import {
  Commit,
  DocumentVersion,
  findFirstModelForProvider,
  User,
  Workspace,
} from '../../../browser'
import { Result } from '../../../lib'
import { createProject } from '../../projects/create'
import { findDefaultProvider } from '../../providerApiKeys/findDefaultProvider'
import { createNewDocument } from '../create'
import { buildDocuments } from './buildDocuments'
import { getIncludedDocuments } from './getIncludedDocuments'

type ForkProps = {
  origin: {
    workspace: Workspace
    commit: Commit
    document: DocumentVersion
  }
  destination: {
    workspace: Workspace
    user: User
  }
  defaultProviderId?: string
}

async function createProjectFromDocument({
  workspace,
  user,
  document,
}: {
  document: DocumentVersion
  workspace: Workspace
  user: User
}) {
  const name = `Copy of ${document.path}`
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

  return Result.ok(newDocs.map((r) => r.unwrap()))
}

export async function forkDocument({
  origin,
  destination,
  defaultProviderId,
}: ForkProps) {
  const { commit, project } = await createProjectFromDocument({
    document: origin.document,
    workspace: destination.workspace,
    user: destination.user,
  }).then((r) => r.unwrap())

  const provider = await findDefaultProvider(destination.workspace).then((r) =>
    r.unwrap(),
  )
  const model = findFirstModelForProvider({
    provider,
    latitudeProvider: defaultProviderId,
  })

  await createDocuments({
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

  return project
}
