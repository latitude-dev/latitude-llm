import { ActionBackendParameters, ActionType } from '../../constants'
import { publisher } from '../../events/publisher'
import { BadRequestError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { User, Workspace } from '../../schema/types'
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
) {
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
        type: 'actionExecuted', // TODO - shouldnt we call this something more specific? were only using it for metrics
        data: {
          workspaceId: workspace.id,
          userEmail: user.email,
          actionType: type,
        },
      })
    },
  )
}
