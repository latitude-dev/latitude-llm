import { User, Workspace } from '../../browser'
import { Providers } from '../../constants'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { createApiKey } from '../apiKeys'
import { createWorkspaceOnboarding } from '../workspaceOnboarding'
import { createMembership } from '../memberships/create'
import { createProviderApiKey } from '../providerApiKeys'
import { createWorkspace } from '../workspaces'
import { createUser } from './createUser'
import { isFeatureEnabledByName } from '../workspaceFeatures/isFeatureEnabledByName'

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
  }: {
    email: string
    name: string
    companyName: string
    defaultProviderName: string
    defaultProviderApiKey: string
    source?: string
    captureException?: (error: Error) => void
  },
  transaction = new Transaction(),
): PromisedResult<{ user: User; workspace: Workspace }> {
  return transaction.call(async (tx) => {
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

    if (firstProvider.error) {
      captureException?.(firstProvider.error)
    }

    await createMembership(
      { confirmedAt: new Date(), user, workspace },
      transaction,
    ).then((r) => r.unwrap())
    await createApiKey({ workspace }, transaction).then((r) => r.unwrap())

    const isNewOnboardingEnabledResult = await isFeatureEnabledByName(
      workspace.id,
      'nocoderOnboarding',
      tx,
    )

    if (!Result.isOk(isNewOnboardingEnabledResult)) {
      return isNewOnboardingEnabledResult
    }

    const isNewOnboardingEnabled = isNewOnboardingEnabledResult.unwrap()
    if (isNewOnboardingEnabled) {
      await createWorkspaceOnboarding({ workspace }, transaction).then((r) =>
        r.unwrap(),
      )
    }

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
