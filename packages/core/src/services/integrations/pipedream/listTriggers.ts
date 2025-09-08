import { PromisedResult } from '../../../lib/Transaction'
import { getApp } from './apps'
import { Result } from '../../../lib/Result'

export async function listPipedreamIntegrationTriggers(
  appNickname: string,
): PromisedResult<{ name: string; description?: string }[]> {
  const appResult = await getApp({
    name: appNickname,
  })

  if (!Result.isOk(appResult)) return appResult

  const app = appResult.unwrap()
  const triggers = app.triggers.map((trigger) => ({
    name: trigger.key,
    description: trigger.description,
  }))

  return Result.ok(triggers)
}
