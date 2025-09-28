import { PipedreamComponent, PipedreamComponentType } from '../../../constants'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { getApp } from './apps'

export async function listPipedreamIntegrationTriggers(
  appNickname: string,
): PromisedResult<{ name: string; description?: string }[]> {
  const appResult = await getApp({
    name: appNickname,
  })

  if (!Result.isOk(appResult)) return appResult

  const app = appResult.unwrap()
  const triggers = app.triggers.map(
    (trigger: PipedreamComponent<PipedreamComponentType.Trigger>) => ({
      name: trigger.key,
      description: trigger.description,
    }),
  )

  return Result.ok(triggers)
}
