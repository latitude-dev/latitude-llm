import { type Commit } from '../../../schema/models/types/Commit'
import { type DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { type User } from '../../../schema/models/types/User'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { Result } from '../../../lib/Result'
import { cloneDocuments } from './cloneDocuments'
import { cloneIntegrations } from './cloneIntegrations'
import { cloneDocumentTriggers } from './cloneTriggers'
import { createForkProject } from './createProject'
import { getImports } from './imports'
import { updateCommit } from '../../commits'

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

export async function forkDocument({
  title,
  prefix = 'Copy of',
  origin,
  destination,
}: ForkProps) {
  const { commit, project } = await createForkProject({
    title,
    prefix,
    workspace: destination.workspace,
    user: destination.user,
  }).then((r) => r.unwrap())

  const imports = await getImports({
    workspace: origin.workspace,
    commit: origin.commit,
    document: origin.document,
  }).then((r) => r.unwrap())

  const clonedIntegrationsMap = await cloneIntegrations({
    originIntegrations: imports.integrations,
    targetWorkspace: destination.workspace,
    targetUser: destination.user,
  }).then((r) => r.unwrap())

  const clonedDocuments = await cloneDocuments({
    originWorkspace: origin.workspace,
    targetWorkspace: destination.workspace,
    targetProject: project,
    targetCommit: commit,
    targetUser: destination.user,
    imports,
    integrationMapping: clonedIntegrationsMap,
  }).then((r) => r.unwrap())

  const clonedDocument = clonedDocuments.find(
    (d) => d.path === origin.document.path,
  )!

  await updateCommit({
    workspace: destination.workspace,
    commit,
    data: {
      mainDocumentUuid: clonedDocument.documentUuid,
    },
  }).then((r) => r.unwrap())

  const triggers = await cloneDocumentTriggers({
    workspace: destination.workspace,
    project,
    commit,
    document: clonedDocument,
    triggers: imports.triggers,
    integrationMapping: clonedIntegrationsMap,
  }).then((r) => r.unwrap())

  return Result.ok({ project, commit, document: clonedDocument, triggers })
}
