import {
  ActionBackendParameters,
  ActionType,
  User,
  Workspace,
} from '../../browser'
import { publisher } from '../../events/publisher'
import { BadRequestError, NotFoundError } from '../../lib/errors'
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
  const limiting = await limiter.consume(user.id)
  if (limiting.error) {
    return Result.error(limiting.error)
  }

  const specification = ACTION_SPECIFICATIONS[type] as unknown as ActionBackendSpecification<T> // prettier-ignore
  if (!specification) {
    return Result.error(new BadRequestError('Invalid action type'))
  }

  const parsing = specification.parameters.safeParse(parameters)
  if (parsing.error) {
    return Result.error(new BadRequestError('Invalid action parameters'))
  }

  const getting = await getWorkspaceOnboarding({ workspace })
  if (getting.error && !(getting.error instanceof NotFoundError)) {
    return Result.error(getting.error)
  }
  const onboarding = getting.value

  return tx.call(
    async (db) => {
      if (onboarding && !onboarding.completedAt) {
        const marking = await markWorkspaceOnboardingComplete({ onboarding }, tx) // prettier-ignore
        if (marking.error) {
          return Result.error(marking.error)
        }
      }

      const executing = await specification.execute(
        { parameters, user, workspace },
        db,
        tx,
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
