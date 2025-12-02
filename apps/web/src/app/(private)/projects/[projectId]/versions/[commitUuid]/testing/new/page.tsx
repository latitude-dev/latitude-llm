import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { CreateTestWizard } from '../_components/CreateTestWizard'

export default async function CreateTestPage({
  params,
}: {
  params: Promise<{
    projectId: string
    commitUuid: string
  }>
}) {
  const { workspace } = await getCurrentUserOrRedirect()
  const { projectId, commitUuid } = await params

  // Fetch available commits
  const commitsRepo = new CommitsRepository(workspace.id)
  const commits = await commitsRepo.getCommits()

  return (
    <CreateTestWizard
      projectId={Number(projectId)}
      commitUuid={commitUuid}
      availableCommits={commits}
    />
  )
}
