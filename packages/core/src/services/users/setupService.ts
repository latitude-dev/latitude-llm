import { database } from '../../client'
import { Providers } from '../../constants'
import { SessionData } from '../../data-access'
import { publisher } from '../../events/publisher'
import { createApiKey } from '../apiKeys'
import { createMembership } from '../memberships/create'
import { importDefaultProject } from '../projects/import'
import { createProviderApiKey } from '../providerApiKeys'
import { createWorkspace } from '../workspaces'
import { createWorkspaceOnboarding } from '../workspaceOnboarding'
import { createUser } from './createUser'
import Transaction, { PromisedResult } from './../../lib/Transaction'
import { Result } from './../../lib/Result'
import { createOnboardingDataset } from '../datasets/createOnboardingDataset'
import { env } from '@latitude-data/env'
import { createOnboardingProject } from '../projects/createOnboardingProject'

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

    if (env.NODE_ENV === 'production') {
      await importDefaultProject({ workspace, user }, tx).then((r) =>
        r.unwrap(),
      )
    } else {
      await createOnboardingProject({ workspace, user }, tx).then((r) =>
        r.unwrap(),
      )
    }

    const results = await Promise.all([
      createMembership({ confirmedAt: new Date(), user, workspace }, tx),
      createApiKey({ workspace }, tx),
      createWorkspaceOnboarding({ workspace }, tx),
      createOnboardingDataset({ workspace, author: user }, tx),
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
