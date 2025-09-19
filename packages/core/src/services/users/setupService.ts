import { env } from '@latitude-data/env'
import { Commit, DocumentVersion, User, Workspace } from '../../browser'
import { Providers } from '../../constants'
import { publisher } from '../../events/publisher'
import { LatitudeError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { createApiKey } from '../apiKeys'
import { createOnboardingDataset } from '../datasets/createOnboardingDataset'
import { ONBOARDING_DOCUMENT_PATH } from '../documents/findOnboardingDocument'
import { createDemoEvaluation } from '../evaluationsV2/createDemoEvaluation'
import { createMembership } from '../memberships/create'
import { createOnboardingProject } from '../projects/createOnboardingProject'
import { importOnboardingProject } from '../projects/import'
import { createProviderApiKey } from '../providerApiKeys'
import { createWorkspace } from '../workspaces'
import { createUser } from './createUser'

const DEFAULT_MODEL = 'gpt-4o-mini'

export default async function setupService(
  {
    email,
    name,
    companyName,
    defaultProviderName,
    defaultProviderApiKey,
    captureException,
    source,
    importDefaultProject = env.IMPORT_DEFAULT_PROJECT,
  }: {
    email: string
    name: string
    companyName: string
    defaultProviderName: string
    defaultProviderApiKey: string
    source?: string
    captureException?: (error: Error) => void
    importDefaultProject?: boolean
  },
  transaction = new Transaction(),
): PromisedResult<{ user: User; workspace: Workspace }> {
  const user = await createUser(
    { email, name, confirmedAt: new Date() },
    transaction,
  ).then((r) => r.unwrap())
  const workspace = await createWorkspace(
    {
      name: companyName,
      user,
      source,
    },
    transaction,
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
    transaction,
  )
  if (!Result.isOk(firstProvider)) {
    captureException?.(firstProvider.error)
  }

  const { onboardingDocument, commit } = await createOrImportOnboardingProject(
    { importDefaultProject, workspace, user },
    transaction,
  )

  await createMembership(
    { confirmedAt: new Date(), user, workspace },
    transaction,
  ).then((r) => r.unwrap())
  await createApiKey({ workspace }, transaction).then((r) => r.unwrap())
  await createOnboardingDataset({ workspace, author: user }, transaction).then(
    (r) => r.unwrap(),
  )
  await createDemoEvaluation(
    { workspace, document: onboardingDocument, commit },
    transaction,
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
  transaction = new Transaction(),
) {
  let documents: DocumentVersion[] = []
  let commit: Commit
  if (importDefaultProject) {
    const { documents: ds, commit: c } = await importOnboardingProject(
      { workspace, user },
      transaction,
    ).then((r) => r.unwrap())
    documents = ds
    commit = c
  } else {
    const { documents: ds, commit: c } = await createOnboardingProject(
      {
        workspace,
        user,
      },
      transaction,
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
