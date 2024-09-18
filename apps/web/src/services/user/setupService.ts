import { Providers } from '@latitude-data/core/browser'
import { SessionData } from '@latitude-data/core/data-access'
import { Result } from '@latitude-data/core/lib/Result'
import Transaction, {
  PromisedResult,
} from '@latitude-data/core/lib/Transaction'
import { createProviderApiKey } from '@latitude-data/core/services/providerApiKeys/create'
import { createUser } from '@latitude-data/core/services/users/createUser'
import { createWorkspace } from '@latitude-data/core/services/workspaces/create'
import { env } from '@latitude-data/env'

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
    const result = await createWorkspace(
      {
        name: companyName,
        user,
      },
      tx,
    )

    if (result.error) return result

    const workspace = result.value
    const resultProviderApiKey = await createProviderApiKey(
      {
        workspace,
        provider: Providers.OpenAI,
        name: env.DEFAULT_PROVIDER_ID,
        token: env.DEFAULT_PROVIDER_API_KEY,
        authorId: user.id,
      },
      tx,
    )
    if (resultProviderApiKey.error) return resultProviderApiKey

    return Result.ok({
      user,
      workspace,
    })
  })
}
