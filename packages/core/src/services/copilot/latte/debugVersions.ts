import { UnauthorizedError } from '@latitude-data/constants/errors'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { isFeatureEnabledByName } from '../../workspaceFeatures/isFeatureEnabledByName'
import { assertCopilotIsSupported, getCopilotDocument } from './helpers'
import { CommitsRepository } from '../../../repositories'

export type LatteVersion = {
  uuid: string
  name: string
  isLive: boolean
}

async function assertLatteDebugModeIsEnabled(
  workspaceId: number,
): PromisedResult<undefined> {
  const isEnabledResult = await isFeatureEnabledByName(
    workspaceId,
    'latteDebugMode',
  )

  // TODO: This returns `boolean | Result<boolean>` for some reason
  const isEnabled =
    typeof isEnabledResult === 'boolean'
      ? isEnabledResult
      : isEnabledResult.value

  if (!isEnabled) {
    return Result.error(
      new UnauthorizedError('This workspace cannot use Latte Debug Mode'),
    )
  }

  return Result.nil()
}

export async function getLatteDebugVersions(
  workspaceId: number,
): PromisedResult<LatteVersion[]> {
  const featureEnabledResult = await assertLatteDebugModeIsEnabled(workspaceId)
  if (!Result.isOk(featureEnabledResult)) return featureEnabledResult

  const latteSupportedResult = assertCopilotIsSupported()
  if (!Result.isOk(latteSupportedResult)) return latteSupportedResult

  const latteResult = await getCopilotDocument()
  if (!Result.isOk(latteResult)) return latteResult

  const {
    workspace: latteWorkspace,
    project: latteProject,
    commit: latteCommit,
  } = latteResult.unwrap()

  const latteCommitsScope = new CommitsRepository(latteWorkspace.id)
  const latteDrafts = await latteCommitsScope.getDrafts(latteProject.id)

  return Result.ok([
    { uuid: latteCommit.uuid, name: latteCommit.title, isLive: true },
    ...latteDrafts.map((d) => ({
      uuid: d.uuid,
      name: d.title,
      isLive: false,
    })),
  ])
}
