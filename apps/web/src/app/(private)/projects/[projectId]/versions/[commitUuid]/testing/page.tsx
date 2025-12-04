import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { DeploymentTestsRepository } from '@latitude-data/core/repositories/deploymentTestsRepository'
import { TestingPageContent } from './_components/TestingPageContent'
import { TestSelectionProvider } from './_components/TestSelectionContext'

export default async function TestingPage({
  params,
}: {
  params: Promise<{
    projectId: string
  }>
}) {
  const { workspace } = await getCurrentUserOrRedirect()
  const { projectId } = await params

  const repo = new DeploymentTestsRepository(workspace.id)
  const tests = await repo.listByProject(Number(projectId))

  return (
    <TestSelectionProvider>
      <TestingPageContent tests={tests} projectId={Number(projectId)} />
    </TestSelectionProvider>
  )
}
