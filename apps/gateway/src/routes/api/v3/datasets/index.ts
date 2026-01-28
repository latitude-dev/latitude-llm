import { createRouter } from '$/openApi/createApp'
import { getAllDatasetsHandler } from './getAll/getAll.handler'
import { getAllDatasetsRoute } from './getAll/getAll.route'
import { getDatasetHandler } from './get/get.handler'
import { getDatasetRoute } from './get/get.route'
import { createDatasetHandler } from './create/create.handler'
import { createDatasetRoute } from './create/create.route'
import { updateDatasetHandler } from './update/update.handler'
import { updateDatasetRoute } from './update/update.route'
import { destroyDatasetHandler } from './destroy/destroy.handler'
import { destroyDatasetRoute } from './destroy/destroy.route'

export const datasetsRouter = createRouter()
  .openapi(getAllDatasetsRoute, getAllDatasetsHandler)
  .openapi(getDatasetRoute, getDatasetHandler)
  .openapi(createDatasetRoute, createDatasetHandler)
  .openapi(updateDatasetRoute, updateDatasetHandler)
  .openapi(destroyDatasetRoute, destroyDatasetHandler)
