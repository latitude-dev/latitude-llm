import { DocumentRunStartedEvent } from '../events'
import { routeRequest } from '../../services/deploymentTests/routeRequest'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  DeploymentTestsRepository,
} from '../../repositories'
import { ProjectsRepository } from '../../repositories'
import { Result } from '../../lib/Result'
import { captureException } from '../../utils/datadogCapture'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { enqueueRun } from '../../services/runs/enqueue'
import { LogSources } from '@latitude-data/constants'

export async function enqueueShadowTestChallengerHandler({
  data: event,
}: {
  data: DocumentRunStartedEvent
}): Promise<void> {
  const {
    workspaceId,
    projectId,
    documentUuid,
    commitUuid,
    parameters,
    customIdentifier,
    tools,
    userMessage,
  } = event.data

  // Prevent infinite recursion: don't trigger shadow test runs from shadow test runs
  if (event.data.run.source === LogSources.ShadowTest) {
    return
  }

  // Find active shadow test for this project
  const deploymentTestsRepo = new DeploymentTestsRepository(workspaceId)
  const allActiveTests =
    await deploymentTestsRepo.findAllActiveForProject(projectId)
  const shadowTest = allActiveTests.find((test) => test.testType === 'shadow')
  if (!shadowTest) return

  // Get the commit to check if it's relevant to this shadow test
  const commitsRepo = new CommitsRepository(workspaceId)
  const headCommit = await commitsRepo.getHeadCommit(projectId)
  const commitResult = await commitsRepo.getCommitByUuid({
    uuid: commitUuid,
    projectId,
  })

  if (!Result.isOk(commitResult)) {
    captureException(commitResult.error)
    return
  }

  const commit = commitResult.unwrap()
  const isHeadCommit = headCommit?.id === commit.id
  const isChallengerCommit = shadowTest.challengerCommitId === commit.id

  // Shadow test is only relevant if commit is head (baseline) or challenger
  if (!isHeadCommit && !isChallengerCommit) return

  // Check if this request should be shadowed based on traffic percentage
  const routedTo = routeRequest(shadowTest, customIdentifier ?? undefined)
  if (routedTo !== 'challenger') return

  // Fetch necessary data
  const workspace = await unsafelyFindWorkspace(workspaceId)
  const projectsRepo = new ProjectsRepository(workspaceId)
  const documentsRepo = new DocumentVersionsRepository(workspaceId)

  // Fetch challenger commit, project, and document for shadow test
  const [challengerCommitResult, projectResult, documentResult] =
    await Promise.all([
      commitsRepo.getCommitById(shadowTest.challengerCommitId),
      projectsRepo.getProjectById(projectId),
      documentsRepo.getDocumentByUuid({ commitUuid, documentUuid }),
    ])

  if (!Result.isOk(challengerCommitResult)) {
    captureException(challengerCommitResult.error)
    return
  }
  if (!Result.isOk(projectResult)) {
    captureException(projectResult.error)
    return
  }
  if (!Result.isOk(documentResult)) {
    captureException(documentResult.error)
    return
  }

  const challengerCommit = challengerCommitResult.unwrap()
  const project = projectResult.unwrap()
  const document = documentResult.unwrap()
  const result = await enqueueRun({
    workspace,
    document,
    commit: challengerCommit,
    project,
    parameters: parameters ?? {},
    customIdentifier: customIdentifier ?? undefined,
    tools: tools ?? [],
    userMessage,
    source: LogSources.ShadowTest,
    simulationSettings: { simulateToolResponses: true },
    activeDeploymentTest: shadowTest,
  })

  if (!Result.isOk(result)) {
    captureException(result.error)
  }
}
