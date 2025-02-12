import { Providers, RewardType } from '../../constants'
import { SessionData } from '../../data-access'
import { publisher } from '../../events/publisher'
import { PromisedResult, Result, Transaction } from '../../lib'
import { createApiKey } from '../apiKeys'
import { claimReward } from '../claimedRewards'
import { createMembership } from '../memberships/create'
import { importDefaultProject } from '../projects/import'
import { createProviderApiKey } from '../providerApiKeys'
import { createWorkspace } from '../workspaces'
import { createUser } from './createUser'

const LAUNCH_DAY = '2024-10-10'

export default function setupService({
  email,
  name,
  companyName,
  defaultProviderId,
  defaultProviderApiKey,
  captureException,
}: {
  email: string
  name: string
  companyName: string
  defaultProviderId?: string
  defaultProviderApiKey?: string
  captureException?: (error: Error) => void
}): PromisedResult<SessionData> {
  return Transaction.call(async (tx) => {
    const userResult = await createUser(
      { email, name, confirmedAt: new Date() },
      tx,
    )

    if (userResult.error) return userResult

    const user = userResult.value
    const resultWorkspace = await createWorkspace(
      {
        name: companyName,
        user,
      },
      tx,
    )
    if (resultWorkspace.error) return resultWorkspace
    const workspace = resultWorkspace.value

    if (new Date().toISOString().split('T')[0] === LAUNCH_DAY) {
      await claimReward(
        {
          workspace,
          user,
          type: RewardType.SignupLaunchDay,
          reference: LAUNCH_DAY, // not really used for this reward type
          autoValidated: true,
        },
        tx,
      )
    }

    if (defaultProviderId && defaultProviderApiKey) {
      const firstProvider = await createProviderApiKey(
        {
          workspace,
          provider: Providers.OpenAI,
          name: defaultProviderId,
          token: defaultProviderApiKey,
          author: user,
        },
        tx,
      )

      if (firstProvider.error) {
        captureException?.(firstProvider.error)
      }
    }

    const resultImportingDefaultProject = await importDefaultProject(
      { workspace, user },
      tx,
    )

    if (resultImportingDefaultProject.error) {
      captureException?.(resultImportingDefaultProject.error)
    }

    const results = await Promise.all([
      createMembership({ confirmedAt: new Date(), user, workspace }, tx),
      createApiKey({ workspace }, tx),
    ])

    const result = Result.findError(results)
    if (result) return result

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
