import { Context } from 'hono'
import { createDataset } from '@latitude-data/core/services/datasets/create'

export const createDatasetHandler = async (c: Context) => {
  const workspace = c.get('workspace')
  const user = c.get('user')
  const body = await c.req.json()

  const result = await createDataset({
    author: user,
    workspace,
    data: {
      name: body.name,
      columns: body.columns,
    },
  })

  const dataset = result.unwrap()
  return c.json(dataset, 201)
}
