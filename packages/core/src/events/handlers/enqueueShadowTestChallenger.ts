import { DocumentRunStartedEvent } from '../events'
import { routeRequest } from '../../services/deploymentTests/routeRequest'
import {
  CommitsRepository,
  DocumentVersionsRepository,
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
    activeDeploymentTest,
    parameters,
    customIdentifier,
    tools,
    userMessage,
  } = event.data

  if (!activeDeploymentTest || activeDeploymentTest.testType !== 'shadow') {
    return
  }

  // Check if this request should be shadowed based on traffic percentage
  const routedTo = routeRequest(
    activeDeploymentTest,
    customIdentifier ?? undefined,
  )
  if (routedTo !== 'challenger') {
    return
  }

  // Fetch necessary data
  const workspace = await unsafelyFindWorkspace(workspaceId)
  const commitsRepo = new CommitsRepository(workspaceId)
  const projectsRepo = new ProjectsRepository(workspaceId)
  const documentsRepo = new DocumentVersionsRepository(workspaceId)

  // Fetch challenger commit, project, and document for shadow test
  const [challengerCommitResult, projectResult, documentResult] =
    await Promise.all([
      commitsRepo.getCommitById(activeDeploymentTest.challengerCommitId),
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
    activeDeploymentTest,
  })

  if (!Result.isOk(result)) {
    captureException(result.error)
  }
}
