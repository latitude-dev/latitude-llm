import { database } from '../../client'
import { Providers } from '../../constants'
import { SessionData } from '../../data-access'
import { publisher } from '../../events/publisher'
import { createApiKey } from '../apiKeys'
import { createMembership } from '../memberships/create'
import { importDefaultProject } from '../projects/import'
import { createProviderApiKey } from '../providerApiKeys'
import { createWorkspace } from '../workspaces'
import { createUser } from './createUser'
import Transaction, { PromisedResult } from './../../lib/Transaction'
import { Result } from './../../lib/Result'

export default function setupService(
  {
    email,
    name,
    companyName,
    defaultProviderName,
    defaultProviderApiKey,
    captureException,
  }: {
    email: string
    name: string
    companyName: string
    defaultProviderName: string
    defaultProviderApiKey: string
    captureException?: (error: Error) => void
  },
  db = database,
): PromisedResult<SessionData> {
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
    const firstProvider = await createProviderApiKey(
      {
        workspace,
        provider: Providers.OpenAI,
        name: defaultProviderName,
        token: defaultProviderApiKey,
        defaultModel: 'gpt-4o-mini', // TODO: Move this to env variable
        author: user,
      },
      tx,
    )

    if (firstProvider.error) {
      captureException?.(firstProvider.error)
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
  }, db)
}
