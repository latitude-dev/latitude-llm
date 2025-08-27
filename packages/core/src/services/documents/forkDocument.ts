import {
  Commit,
  DocumentVersion,
  findFirstModelForProvider,
  User,
  Workspace,
} from '../../browser'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import { findDefaultProvider } from '../providerApiKeys/findDefaultProvider'
import { createNewDocument } from './create'
import { buildDocuments } from './forkDocument/buildDocuments'
import { cloneDocumentTriggers } from './forkDocument/cloneTriggers'
import { createForkProject } from './forkDocument/createProject'
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
  const { commit, project } = await createForkProject({
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

  const triggers = await cloneDocumentTriggers({
    originWorkspace: origin.workspace,
    originCommit: origin.commit,
    originDocument: origin.document,
    targetWorkspace: destination.workspace,
    targetProject: project,
    targetCommit: commit,
    targetDocument: copiedDocument,
    targetUser: destination.user,
  }).then((r) => r.unwrap())

  return Result.ok({ project, commit, document: copiedDocument, triggers })
}
