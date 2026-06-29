import { type Commit } from '../../schema/models/types/Commit'
import { type Workspace } from '../../schema/models/types/Workspace'
import { Result, TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { UnprocessableEntityError } from '../../lib/errors'
import { mergeCommit } from './merge'
import { updateCommit } from './update'
import { assertCanEditCommit } from '../../lib/assertCanEditCommit'
import { isFeatureEnabledByName } from '../workspaceFeatures/isFeatureEnabledByName'
import { DISABLE_VERSION_DEPLOY_FLAG } from '../workspaceFeatures/flags'

export async function updateAndMergeCommit(
  {
    commit,
    workspace,
    data,
  }: {
    commit: Commit
    workspace: Workspace
    data: {
      title?: string
      description?: string | null
    }
  },
  transaction = new Transaction(),
): Promise<TypedResult<Commit, Error>> {
  const assertResult = await assertCanEditCommit(commit)
  if (assertResult.error) return assertResult

  const deployDisabled = await isFeatureEnabledByName(
    workspace.id,
    DISABLE_VERSION_DEPLOY_FLAG,
  ).then((r) => r.unwrap())
  if (deployDisabled) {
    const message =
      'Deploying versions is disabled for this workspace. Contact your Latitude administrator if you need to publish changes.'
    return Result.error(
      new UnprocessableEntityError(message, {
        [commit.id]: [message],
      }),
    )
  }

  if (Object.keys(data).length > 0) {
    const updateResult = await updateCommit(
      {
        workspace,
        commit,
        data,
      },
      transaction,
    )
    if (updateResult.error) return updateResult
    commit = updateResult.value
  }

  return mergeCommit(commit, transaction)
}
