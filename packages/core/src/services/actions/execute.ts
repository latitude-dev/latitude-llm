import {
  ActionBackendParameters,
  ActionType,
  User,
  Workspace,
} from '../../browser'
import { publisher } from '../../events/publisher'
import { BadRequestError } from '../../lib/errors'
import RateLimiter from '../../lib/RateLimiter'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { getWorkspaceOnboarding } from '../workspaceOnboarding/get'
import { markWorkspaceOnboardingComplete } from '../workspaceOnboarding/update'
import { ActionBackendSpecification } from './shared'
import { ACTION_SPECIFICATIONS } from './specifications'

export async function executeAction<T extends ActionType = ActionType>(
  {
    type,
    parameters,
    user,
    workspace,
  }: {
    type: T
    parameters: ActionBackendParameters<T>
    user: User
    workspace: Workspace
  },
  tx = new Transaction(),
  limiter = new RateLimiter({
    limit: 10,
    period: 60,
  }),
) {
  await limiter.consume(user.id)

  const specification = ACTION_SPECIFICATIONS[type] as unknown as ActionBackendSpecification<T> // prettier-ignore
  if (!specification) {
    return Result.error(new BadRequestError('Invalid action type'))
  }

  const parsing = specification.parameters.safeParse(parameters)
  if (parsing.error) {
    return Result.error(new BadRequestError('Invalid action parameters'))
  }

  return tx.call(
    async (db) => {
      const getting = await getWorkspaceOnboarding({ workspace }, tx)
      if (getting.error) {
        return Result.error(getting.error)
      }
      const onboarding = getting.value

      if (!onboarding.completedAt) {
        const marking = await markWorkspaceOnboardingComplete({ onboarding }, tx) // prettier-ignore
        if (marking.error) {
          return Result.error(marking.error)
        }
      }

      const executing = await specification.execute(
        { parameters, user, workspace },
        db,
      )
      if (executing.error) {
        return Result.error(executing.error)
      }
      const result = executing.value

      return Result.ok(result)
    },
    async () => {
      await publisher.publishLater({
        type: 'actionExecuted',
        data: {
          workspaceId: workspace.id,
          userEmail: user.email,
          actionType: type,
        },
      })
    },
  )
}
