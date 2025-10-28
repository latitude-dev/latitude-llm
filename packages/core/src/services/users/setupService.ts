import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import { Providers } from '@latitude-data/constants'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { createApiKey } from '../apiKeys'
import { createWorkspaceOnboarding } from '../workspaceOnboarding'
import { createMembership } from '../memberships/create'
import { createProviderApiKey } from '../providerApiKeys'
import { createWorkspace } from '../workspaces'
import { createUser } from './createUser'
import { UserTitle } from '@latitude-data/constants/users'
import { createDatasetOnboarding } from '../onboardingResources/createDatasetOnboarding'

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
    title,
  }: {
    email: string
    name: string
    companyName: string
    defaultProviderName: string
    defaultProviderApiKey: string
    source?: string
    captureException?: (error: Error) => void
    title?: UserTitle
  },
  transaction = new Transaction(),
): PromisedResult<{ user: User; workspace: Workspace }> {
  return transaction.call(async () => {
    const user = await createUser(
      { email, name, confirmedAt: new Date(), title },
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

    if (firstProvider.error) {
      captureException?.(firstProvider.error)
    }

    await createMembership(
      { confirmedAt: new Date(), user, workspace },
      transaction,
    ).then((r) => r.unwrap())
    await createApiKey({ workspace }, transaction).then((r) => r.unwrap())

    await createWorkspaceOnboarding({ workspace }, transaction).then((r) =>
      r.unwrap(),
    )

    // TODO(onboarding): remove this once we merge this PR
    //   const isDatasetOnboardingEnabledResult = await isFeatureEnabledByName(
    //     workspace.id,
    //     'dataset-onboarding',
    //   )

    //   if (!Result.isOk(isDatasetOnboardingEnabledResult)) {
    //     return redirect(ROUTES.dashboard.root)
    //   }
    //   const isDatasetOnboardingEnabled = isDatasetOnboardingEnabledResult.unwrap()

    //   if (isDatasetOnboardingEnabled) {
    await createDatasetOnboarding({ workspace, user }, transaction).then((r) =>
      r.unwrap(),
    )
    //   }

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
  })
}
