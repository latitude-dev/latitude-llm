import { PipedreamClient } from '@pipedream/sdk'
import {
  PipedreamComponent,
  PipedreamComponentType,
} from '../../../../constants'
import { PromisedResult } from '../../../../lib/Transaction'
import { getPipedreamClient } from '../apps'
import { Result } from '../../../../lib/Result'

const LIST_COMPONENTS_LIMIT = 64

export async function getComponentsForApp(
  appName: string,
  pipedream?: PipedreamClient,
): PromisedResult<{
  tools: PipedreamComponent<PipedreamComponentType.Tool>[]
  triggers: PipedreamComponent<PipedreamComponentType.Trigger>[]
}> {
  if (!pipedream) {
    const pipedreamResult = getPipedreamClient()
    if (!Result.isOk(pipedreamResult)) return pipedreamResult
    pipedream = pipedreamResult.unwrap()
  }

  let list = await pipedream.components.list({
    app: appName,
    limit: LIST_COMPONENTS_LIMIT,
  })

  const tools: PipedreamComponent<PipedreamComponentType.Tool>[] = []
  const triggers: PipedreamComponent<PipedreamComponentType.Trigger>[] = []

  const processPage = (pageData: typeof list.data) => {
    tools.push(
      ...(pageData.filter(
        (component) => component.componentType === PipedreamComponentType.Tool,
      ) as PipedreamComponent<PipedreamComponentType.Tool>[]),
    )

    triggers.push(
      ...(pageData.filter(
        (component) =>
          component.componentType === PipedreamComponentType.Trigger,
      ) as PipedreamComponent<PipedreamComponentType.Trigger>[]),
    )
  }

  processPage(list.data)

  while (list.hasNextPage()) {
    list = await list.getNextPage()
    processPage(list.data)
  }

  return Result.ok({
    tools,
    triggers,
  })
}
