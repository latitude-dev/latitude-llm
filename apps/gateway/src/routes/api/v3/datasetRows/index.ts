import { createRouter } from '$/openApi/createApp'
import { getAllDatasetRowsHandler } from './getAll/getAll.handler'
import { getAllDatasetRowsRoute } from './getAll/getAll.route'
import { getDatasetRowHandler } from './get/get.handler'
import { getDatasetRowRoute } from './get/get.route'
import { createDatasetRowHandler } from './create/create.handler'
import { createDatasetRowRoute } from './create/create.route'
import { updateDatasetRowHandler } from './update/update.handler'
import { updateDatasetRowRoute } from './update/update.route'
import { destroyDatasetRowHandler } from './destroy/destroy.handler'
import { destroyDatasetRowRoute } from './destroy/destroy.route'

export const datasetRowsRouter = createRouter()
  // @ts-expect-error: broken types
  .openapi(getAllDatasetRowsRoute, getAllDatasetRowsHandler)
  // @ts-expect-error: broken types
  .openapi(getDatasetRowRoute, getDatasetRowHandler)
  // @ts-expect-error: broken types
  .openapi(createDatasetRowRoute, createDatasetRowHandler)
  // @ts-expect-error: broken types
  .openapi(updateDatasetRowRoute, updateDatasetRowHandler)
  // @ts-expect-error: broken types
  .openapi(destroyDatasetRowRoute, destroyDatasetRowHandler)
