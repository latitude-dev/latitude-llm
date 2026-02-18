import { createRouter } from '$/openApi/createApp'
import { route } from '$/routes/api/helpers'
import { API_ROUTES } from '$/api.routes'

import { getAllDatasetsHandler } from '$/routes/api/v3/datasets/getAll/getAll.handler'
import { getAllDatasetsRouteConfig } from '$/routes/api/v3/datasets/getAll/getAll.route'
import { getDatasetHandler } from '$/routes/api/v3/datasets/get/get.handler'
import { getDatasetRouteConfig } from '$/routes/api/v3/datasets/get/get.route'
import { createDatasetHandler } from '$/routes/api/v3/datasets/create/create.handler'
import { createDatasetRouteConfig } from '$/routes/api/v3/datasets/create/create.route'
import { updateDatasetHandler } from '$/routes/api/v3/datasets/update/update.handler'
import { updateDatasetRouteConfig } from '$/routes/api/v3/datasets/update/update.route'
import { destroyDatasetHandler } from '$/routes/api/v3/datasets/destroy/destroy.handler'
import { destroyDatasetRouteConfig } from '$/routes/api/v3/datasets/destroy/destroy.route'

export const datasetsRouter = createRouter()
  .openapi(
    route(getAllDatasetsRouteConfig, API_ROUTES.v4.datasets.getAll),
    getAllDatasetsHandler,
  )
  .openapi(
    route(getDatasetRouteConfig, API_ROUTES.v4.datasets.get),
    getDatasetHandler,
  )
  .openapi(
    route(createDatasetRouteConfig, API_ROUTES.v4.datasets.create),
    createDatasetHandler,
  )
  .openapi(
    route(updateDatasetRouteConfig, API_ROUTES.v4.datasets.update),
    updateDatasetHandler,
  )
  .openapi(
    route(destroyDatasetRouteConfig, API_ROUTES.v4.datasets.destroy),
    destroyDatasetHandler,
  )
