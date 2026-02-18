import { createRouter } from '$/openApi/createApp'
import { route } from '$/routes/api/helpers'
import { API_ROUTES } from '$/api.routes'

import { getAllDatasetRowsHandler } from '$/routes/api/v3/datasetRows/getAll/getAll.handler'
import { getAllDatasetRowsRouteConfig } from '$/routes/api/v3/datasetRows/getAll/getAll.route'
import { getDatasetRowHandler } from '$/routes/api/v3/datasetRows/get/get.handler'
import { getDatasetRowRouteConfig } from '$/routes/api/v3/datasetRows/get/get.route'
import { createDatasetRowHandler } from '$/routes/api/v3/datasetRows/create/create.handler'
import { createDatasetRowRouteConfig } from '$/routes/api/v3/datasetRows/create/create.route'
import { updateDatasetRowHandler } from '$/routes/api/v3/datasetRows/update/update.handler'
import { updateDatasetRowRouteConfig } from '$/routes/api/v3/datasetRows/update/update.route'
import { destroyDatasetRowHandler } from '$/routes/api/v3/datasetRows/destroy/destroy.handler'
import { destroyDatasetRowRouteConfig } from '$/routes/api/v3/datasetRows/destroy/destroy.route'

export const datasetRowsRouter = createRouter()
  .openapi(
    route(getAllDatasetRowsRouteConfig, API_ROUTES.v4.datasetRows.getAll),
    getAllDatasetRowsHandler,
  )
  .openapi(
    route(getDatasetRowRouteConfig, API_ROUTES.v4.datasetRows.get),
    getDatasetRowHandler,
  )
  .openapi(
    route(createDatasetRowRouteConfig, API_ROUTES.v4.datasetRows.create),
    createDatasetRowHandler,
  )
  .openapi(
    route(updateDatasetRowRouteConfig, API_ROUTES.v4.datasetRows.update),
    updateDatasetRowHandler,
  )
  .openapi(
    route(destroyDatasetRowRouteConfig, API_ROUTES.v4.datasetRows.destroy),
    destroyDatasetRowHandler,
  )
