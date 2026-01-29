import { NotFoundError } from '@latitude-data/constants/errors'
import { createDataset } from '@latitude-data/core/services/datasets/create'
import { findFirstUserInWorkspace } from '@latitude-data/core/data-access/users'
import { type Column } from '@latitude-data/core/schema/models/datasets'
import { AppRouteHandler } from '$/openApi/types'
import { createDatasetRoute } from './create.route'

export const createDatasetHandler: AppRouteHandler<
  typeof createDatasetRoute
> = async (c) => {
  const workspace = c.get('workspace')

  const { name, columns } = c.req.valid('json') as {
    name: string
    columns: Column[]
  }

  const user = await findFirstUserInWorkspace(workspace)
  if (!user) {
    throw new NotFoundError('User not found in workspace')
  }

  const dataset = await createDataset({
    author: user,
    workspace,
    data: {
      name,
      columns,
    },
  }).then((result) => result.unwrap())

  return c.json(dataset, 201)
}
