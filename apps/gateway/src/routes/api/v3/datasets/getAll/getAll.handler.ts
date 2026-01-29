import { Context } from 'hono'
import { DatasetsRepository } from '@latitude-data/core/repositories'
import { DEFAULT_PAGINATION_SIZE } from '@latitude-data/core/constants'

export const getAllDatasetsHandler = async (c: Context) => {
  const workspace = c.get('workspace')
  const page = c.req.query('page') || '1'
  const pageSize = c.req.query('pageSize') || String(DEFAULT_PAGINATION_SIZE)

  const datasetsRepository = new DatasetsRepository(workspace.id)
  const datasets = await datasetsRepository.findAllPaginated({
    page,
    pageSize,
  })

  return c.json(datasets, 200)
}
