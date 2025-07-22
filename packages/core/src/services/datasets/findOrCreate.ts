import { User, Workspace } from '../../browser'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { DatasetsRepository } from '../../repositories'
import { createDataset } from './create'

export async function findOrCreateDataset(
  {
    name,
    author,
    workspace,
  }: {
    name: string
    author: User
    workspace: Workspace
  },
  transaction = new Transaction(),
) {
  const repo = new DatasetsRepository(workspace.id)
  const datasets = await repo.findByName(name)
  const dataset = datasets[0]
  if (dataset) return Result.ok(dataset)

  return createDataset(
    {
      author,
      workspace,
      data: { name, columns: [] },
    },
    transaction,
  )
}
