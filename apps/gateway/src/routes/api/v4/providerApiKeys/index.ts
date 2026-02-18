import { createRouter } from '$/openApi/createApp'
import { route } from '$/routes/api/helpers'
import { API_ROUTES } from '$/api.routes'

import { getAllProviderApiKeysHandler } from '$/routes/api/v3/providerApiKeys/getAll/getAll.handler'
import { getAllProviderApiKeysRouteConfig } from '$/routes/api/v3/providerApiKeys/getAll/getAll.route'
import { getProviderApiKeyHandler } from '$/routes/api/v3/providerApiKeys/get/get.handler'
import { getProviderApiKeyRouteConfig } from '$/routes/api/v3/providerApiKeys/get/get.route'
import { createProviderApiKeyHandler } from '$/routes/api/v3/providerApiKeys/create/create.handler'
import { createProviderApiKeyRouteConfig } from '$/routes/api/v3/providerApiKeys/create/create.route'
import { updateProviderApiKeyHandler } from '$/routes/api/v3/providerApiKeys/update/update.handler'
import { updateProviderApiKeyRouteConfig } from '$/routes/api/v3/providerApiKeys/update/update.route'
import { destroyProviderApiKeyHandler } from '$/routes/api/v3/providerApiKeys/destroy/destroy.handler'
import { destroyProviderApiKeyRouteConfig } from '$/routes/api/v3/providerApiKeys/destroy/destroy.route'

export const providerApiKeysRouter = createRouter()
  .openapi(
    route(
      getAllProviderApiKeysRouteConfig,
      API_ROUTES.v4.providerApiKeys.getAll,
    ),
    getAllProviderApiKeysHandler,
  )
  .openapi(
    route(getProviderApiKeyRouteConfig, API_ROUTES.v4.providerApiKeys.get),
    getProviderApiKeyHandler,
  )
  .openapi(
    route(
      createProviderApiKeyRouteConfig,
      API_ROUTES.v4.providerApiKeys.create,
    ),
    createProviderApiKeyHandler,
  )
  .openapi(
    route(
      updateProviderApiKeyRouteConfig,
      API_ROUTES.v4.providerApiKeys.update,
    ),
    updateProviderApiKeyHandler,
  )
  .openapi(
    route(
      destroyProviderApiKeyRouteConfig,
      API_ROUTES.v4.providerApiKeys.destroy,
    ),
    destroyProviderApiKeyHandler,
  )
