import { Providers, RewardType } from '@latitude-data/core/browser'
import { SessionData } from '@latitude-data/core/data-access'
import { Result } from '@latitude-data/core/lib/Result'
import Transaction, {
  PromisedResult,
} from '@latitude-data/core/lib/Transaction'
import { createApiKey } from '@latitude-data/core/services/apiKeys/create'
import { claimReward } from '@latitude-data/core/services/claimedRewards/claim'
import { createMembership } from '@latitude-data/core/services/memberships/create'
import { importDefaultProject } from '@latitude-data/core/services/projects/import'
import { createProviderApiKey } from '@latitude-data/core/services/providerApiKeys/create'
import { createUser } from '@latitude-data/core/services/users/createUser'
import { createWorkspace } from '@latitude-data/core/services/workspaces/create'
import { env } from '@latitude-data/env'
import { captureException } from '$/helpers/captureException'

const LAUNCH_DAY = '2024-10-10'

export default function setupService({
  email,
  name,
  companyName,
}: {
  email: string
  name: string
  companyName: string
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

    const firstProvider = await createProviderApiKey(
      {
        workspace,
        provider: Providers.OpenAI,
        name: env.DEFAULT_PROVIDER_ID,
        token: env.DEFAULT_PROVIDER_API_KEY,
        author: user,
      },
      tx,
    )

    if (firstProvider.error) {
      captureException(firstProvider.error)
    }

    const resultImportingDefaultProject = await importDefaultProject(
      { workspace, user },
      tx,
    )

    if (resultImportingDefaultProject.error) {
      captureException(resultImportingDefaultProject.error)
    }

    const results = await Promise.all([
      createMembership({ confirmedAt: new Date(), user, workspace }, tx),
      createApiKey({ workspace }, tx),
    ])

    const result = Result.findError(results)
    if (result) return result

    return Result.ok({
      user,
      workspace,
    })
  })
}
