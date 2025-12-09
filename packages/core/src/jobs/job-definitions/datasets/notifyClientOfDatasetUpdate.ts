import { Job } from 'bullmq'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { DatasetsRepository, UsersRepository } from '../../../repositories'
import { DatasetUpdateMailer } from '../../../mailer/mailers/datasets/DatasetUpdateMailer'

type NotifyClientOfDatasetUpdateJobProps = {
  userId: string
  datasetId: number
  workspaceId: number
}

export const notifyClientOfDatasetUpdate = async (
  job: Job<NotifyClientOfDatasetUpdateJobProps>,
) => {
  const { userId, datasetId, workspaceId } = job.data
  const w = await unsafelyFindWorkspace(workspaceId)
  if (!w) return

  const repo = new DatasetsRepository(w.id)
  const dataset = await repo.find(datasetId).then((r) => r.unwrap())
  const usersRepo = new UsersRepository(w.id)
  const user = await usersRepo.find(userId).then((r) => r.unwrap())

  const mailer = new DatasetUpdateMailer(
    {
      user,
      dataset,
    },
    {
      to: user.email,
    },
  )

  await mailer.send()
}
