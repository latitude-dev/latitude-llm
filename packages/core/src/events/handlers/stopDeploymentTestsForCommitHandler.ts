import { DeploymentTestsRepository } from '../../repositories'
import { stopDeploymentTest } from '../../services/deploymentTests/stop'
import { captureException } from '../../utils/datadogCapture'
import { CommitMergedEvent, CommitDeletedEvent } from '../events'

export async function stopDeploymentTestsForCommitHandler({
  data: event,
}: {
  data: CommitMergedEvent | CommitDeletedEvent
}): Promise<void> {
  const { commit, workspaceId } = event.data

  try {
    const deploymentTestsRepo = new DeploymentTestsRepository(workspaceId)
    const activeTest = await deploymentTestsRepo.findActiveForCommit(
      commit.projectId,
      commit.id,
    )
    if (!activeTest) return

    await stopDeploymentTest({ test: activeTest }).then((r) => r.unwrap())
  } catch (error) {
    captureException(error as Error)
  }
}
