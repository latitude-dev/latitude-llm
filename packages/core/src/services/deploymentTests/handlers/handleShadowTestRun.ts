import { LogSources } from '@latitude-data/constants'
import { enqueueRun, EnqueueRunProps } from '../../runs/enqueue'
import { CommitsRepository, ProjectsRepository } from '../../../repositories'
import type { DeploymentTest } from '../../../schema/models/types/DeploymentTest'
import { Result } from '../../../lib/Result'

export type HandleShadowTestInput = {
  workspace: any
  document: any
  activeTest: DeploymentTest
  parameters: Record<string, unknown>
  customIdentifier?: string | null
  tools: any[]
  userMessage?: string
  requestId?: string
}

export type ShadowTestResult = {
  effectiveSource: LogSources
}

/**
 * Helper to enqueue the challenger run after baseline completion
 * Called from stream completion handler or background job
 */
export async function enqueueShadowTestChallenger({
  workspace,
  document,
  activeDeploymentTest,
  ...rest
}: EnqueueRunProps) {
  if (!activeDeploymentTest) return Result.nil()
  if (activeDeploymentTest.testType !== 'shadow') return Result.nil()

  const commitsRepo = new CommitsRepository(workspace.id)
  const projectsRepo = new ProjectsRepository(workspace.id)
  const [challengerCommitResult, projectResult] = await Promise.all([
    commitsRepo.getCommitById(activeDeploymentTest.challengerCommitId),
    projectsRepo.getProjectById(activeDeploymentTest.projectId),
  ])
  if (!Result.isOk(challengerCommitResult)) return challengerCommitResult
  if (!Result.isOk(projectResult)) return projectResult

  const challengerCommit = challengerCommitResult.unwrap()
  const project = projectResult.unwrap()

  return enqueueRun({
    ...rest,
    workspace,
    project,
    document,
    commit: challengerCommit,
    source: LogSources.ShadowTest,
    simulationSettings: { simulateToolResponses: true },
    activeDeploymentTest,
  })
}
