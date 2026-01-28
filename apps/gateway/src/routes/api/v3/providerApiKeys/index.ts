import { createRouter } from '$/openApi/createApp'
import { getAllProviderApiKeysHandler } from './getAll/getAll.handler'
import { getAllProviderApiKeysRoute } from './getAll/getAll.route'
import { getProviderApiKeyHandler } from './get/get.handler'
import { getProviderApiKeyRoute } from './get/get.route'
import { createProviderApiKeyHandler } from './create/create.handler'
import { createProviderApiKeyRoute } from './create/create.route'
import { updateProviderApiKeyHandler } from './update/update.handler'
import { updateProviderApiKeyRoute } from './update/update.route'
import { destroyProviderApiKeyHandler } from './destroy/destroy.handler'
import { destroyProviderApiKeyRoute } from './destroy/destroy.route'

export const providerApiKeysRouter = createRouter()
  .openapi(getAllProviderApiKeysRoute, getAllProviderApiKeysHandler)
  .openapi(getProviderApiKeyRoute, getProviderApiKeyHandler)
  .openapi(createProviderApiKeyRoute, createProviderApiKeyHandler)
  .openapi(updateProviderApiKeyRoute, updateProviderApiKeyHandler)
  .openapi(destroyProviderApiKeyRoute, destroyProviderApiKeyHandler)
