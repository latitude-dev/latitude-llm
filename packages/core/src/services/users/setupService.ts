import { database } from '../../client'
import { Providers } from '../../constants'
import { publisher } from '../../events/publisher'
import { createApiKey } from '../apiKeys'
import { createMembership } from '../memberships/create'
import { createProviderApiKey } from '../providerApiKeys'
import { createWorkspace } from '../workspaces'
import { createWorkspaceOnboarding } from '../workspaceOnboarding'
import { createUser } from './createUser'
import Transaction, { PromisedResult } from './../../lib/Transaction'
import { Result } from './../../lib/Result'
import { createOnboardingDataset } from '../datasets/createOnboardingDataset'
import { createOnboardingProject } from '../projects/createOnboardingProject'
import { importOnboardingProject } from '../projects/import'
import { Commit, DocumentVersion, User, Workspace } from '../../browser'
import { ONBOARDING_DOCUMENT_PATH } from '../documents/findOnboardingDocument'
import { LatitudeError } from '../../lib/errors'
import { env } from '@latitude-data/env'
import { createDemoEvaluation } from '../evaluationsV2/createDemoEvaluation'

const DEFAULT_MODEL = 'gpt-4o-mini'

export default function setupService(
  {
    email,
    name,
    companyName,
    defaultProviderName,
    defaultProviderApiKey,
    captureException,
    importDefaultProject = env.IMPORT_DEFAULT_PROJECT,
  }: {
    email: string
    name: string
    companyName: string
    defaultProviderName: string
    defaultProviderApiKey: string
    captureException?: (error: Error) => void
    importDefaultProject?: boolean
  },
  db = database,
): PromisedResult<{ user: User; workspace: Workspace }> {
  return Transaction.call(async (tx) => {
    const user = await createUser(
      { email, name, confirmedAt: new Date() },
      tx,
    ).then((r) => r.unwrap())
    const workspace = await createWorkspace(
      {
        name: companyName,
        user,
      },
      tx,
    ).then((r) => r.unwrap())
    const firstProvider = await createProviderApiKey(
      {
        workspace,
        provider: Providers.OpenAI,
        name: defaultProviderName,
        token: defaultProviderApiKey,
        defaultModel: DEFAULT_MODEL, // TODO: Move this to env variable
        author: user,
      },
      tx,
    )
    if (firstProvider.error) {
      captureException?.(firstProvider.error)
    }

    const { onboardingDocument, commit } =
      await createOrImportOnboardingProject(
        { importDefaultProject, workspace, user },
        tx,
      )

    await createMembership(
      { confirmedAt: new Date(), user, workspace },
      tx,
    ).then((r) => r.unwrap())
    await createApiKey({ workspace }, tx).then((r) => r.unwrap())
    await createWorkspaceOnboarding({ workspace }, tx).then((r) => r.unwrap())
    await createOnboardingDataset({ workspace, author: user }, tx).then((r) =>
      r.unwrap(),
    )
    await createDemoEvaluation(
      { workspace, document: onboardingDocument, commit },
      tx,
    ).then((r) => r.unwrap())

    publisher.publishLater({
      type: 'userCreated',
      data: {
        ...user,
        workspaceId: workspace.id,
        userEmail: user.email,
      },
    })

    return Result.ok({
      user,
      workspace,
    })
  }, db)
}

async function createOrImportOnboardingProject(
  {
    importDefaultProject,
    workspace,
    user,
  }: {
    importDefaultProject: boolean
    workspace: Workspace
    user: User
  },
  db = database,
) {
  let documents: DocumentVersion[] = []
  let commit: Commit
  if (importDefaultProject) {
    const { documents: ds, commit: c } = await importOnboardingProject(
      { workspace, user },
      db,
    ).then((r) => r.unwrap())
    documents = ds
    commit = c
  } else {
    const { documents: ds, commit: c } = await createOnboardingProject(
      {
        workspace,
        user,
      },
      db,
    ).then((r) => r.unwrap())

    documents = ds
    commit = c
  }
  const onboardingDocument = documents.find(
    (document) => document.path === ONBOARDING_DOCUMENT_PATH,
  )
  if (!onboardingDocument) {
    throw new LatitudeError('Onboarding document not found')
  }

  return { commit, onboardingDocument }
}
