import { AppRouteHandler } from '$/openApi/types'
import { GetRoute } from './get.route'
import { conversationPresenter } from '$/presenters/conversationPresenter'
import { ProviderLogsRepository } from '@latitude-data/core/repositories'
import { Result } from '@latitude-data/core/lib/Result'
import { NotFoundError } from '@latitude-data/core/lib/errors'

// @ts-expect-error: Hono/Zod OpenAPI type inference limitation
export const getHandler: AppRouteHandler<GetRoute> = async (context) => {
  const { conversationUuid } = context.req.valid('param')
  const workspace = context.get('workspace')

  const providerLogsScope = new ProviderLogsRepository(workspace.id)
  const lastHydratedProviderLogResult =
    await providerLogsScope.findLastByDocumentLogUuid(conversationUuid)

  if (!Result.isOk(lastHydratedProviderLogResult)) {
    throw new NotFoundError('Conversation not found')
  }

  const lastHydratedProviderLog = lastHydratedProviderLogResult.unwrap()

  const conversation = conversationPresenter(lastHydratedProviderLog)

  return context.json(conversation, 200)
}
