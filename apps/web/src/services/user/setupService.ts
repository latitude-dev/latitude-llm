import { Providers } from '@latitude-data/core/browser'
import { SessionData } from '@latitude-data/core/data-access'
import { Result } from '@latitude-data/core/lib/Result'
import Transaction, {
  PromisedResult,
} from '@latitude-data/core/lib/Transaction'
import { createApiKey } from '@latitude-data/core/services/apiKeys/create'
import { createMembership } from '@latitude-data/core/services/memberships/create'
import { importDefaultProject } from '@latitude-data/core/services/projects/import'
import { createProviderApiKey } from '@latitude-data/core/services/providerApiKeys/create'
import { createUser } from '@latitude-data/core/services/users/createUser'
import { createWorkspace } from '@latitude-data/core/services/workspaces/create'
import { env } from '@latitude-data/env'
import { captureException } from '$/helpers/captureException'

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
      createProviderApiKey(
        {
          workspace,
          provider: Providers.OpenAI,
          name: env.DEFAULT_PROVIDER_ID,
          token: env.DEFAULT_PROVIDER_API_KEY,
          authorId: user.id,
        },
        tx,
      ),
    ])

    const result = Result.findError(results)
    if (result) return result

    return Result.ok({
      user,
      workspace,
    })
  })
}
