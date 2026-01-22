import { LogSources } from '@latitude-data/constants'
import {
  CommitsRepository,
  DeploymentTestsRepository,
  DocumentVersionsRepository,
} from '../../repositories'
import { routeRequest } from './routeRequest'
import { Commit } from '../../schema/models/types/Commit'
import { DeploymentTest } from '../../schema/models/types/DeploymentTest'
import { DocumentVersion } from '../../schema/models/types/DocumentVersion'

export type ResolveAbTestRoutingResult = {
  abTest: DeploymentTest | null
  effectiveCommit: Commit
  effectiveDocument: DocumentVersion
  effectiveSource: LogSources
}

/**
 * Resolves A/B test routing for a document run request.
 *
 * Finds active A/B tests and routes the request to either the baseline or challenger variant
 * based on the custom identifier (using consistent hashing).
 *
 * @param params - The A/B test routing parameters
 * @param params.workspaceId - The workspace ID
 * @param params.projectId - The project ID
 * @param params.commit - The original commit from the request
 * @param params.document - The original document from the request
 * @param params.source - The original log source from the request
 * @param params.customIdentifier - Optional custom identifier for A/B test routing
 * @returns Object containing:
 *   - abTest: Active A/B test (if any)
 *   - effectiveCommit: Commit to use (may differ from original for A/B tests)
 *   - effectiveDocument: Document to use (fetched from effectiveCommit if different)
 *   - effectiveSource: Log source (updated to reflect baseline/challenger for A/B tests)
 */
export async function resolveAbTestRouting({
  workspaceId,
  projectId,
  commit,
  document,
  source,
  customIdentifier,
}: {
  workspaceId: number
  projectId: number
  commit: Commit
  document: DocumentVersion
  source: LogSources
  customIdentifier?: string | null
}): Promise<ResolveAbTestRoutingResult> {
  const deploymentTestsRepo = new DeploymentTestsRepository(workspaceId)
  const commitsRepo = new CommitsRepository(workspaceId)

  const allActiveTests =
    await deploymentTestsRepo.findAllActiveForProject(projectId)

  const headCommit = await commitsRepo.getHeadCommit(projectId)
  const isHeadCommit = headCommit?.id === commit.id

  const abTest = allActiveTests.find(
    (test) =>
      test.testType === 'ab' &&
      (isHeadCommit || test.challengerCommitId === commit.id),
  )

  if (!abTest) {
    return {
      abTest: null,
      effectiveCommit: commit,
      effectiveDocument: document,
      effectiveSource: source,
    }
  }

  const routedTo = routeRequest(abTest, customIdentifier)

  if (!headCommit) {
    return {
      abTest,
      effectiveCommit: commit,
      effectiveDocument: document,
      effectiveSource: source,
    }
  }

  const commitIdToUse =
    routedTo === 'baseline' ? headCommit.id : abTest.challengerCommitId

  const effectiveSource =
    routedTo === 'baseline' ? source : LogSources.ABTestChallenger

  if (commitIdToUse === commit.id) {
    return {
      abTest,
      effectiveCommit: commit,
      effectiveDocument: document,
      effectiveSource,
    }
  }

  const effectiveCommit = await commitsRepo
    .getCommitById(commitIdToUse)
    .then((r) => r.unwrap())

  const docsRepo = new DocumentVersionsRepository(workspaceId)
  const effectiveDocument = await docsRepo
    .getDocumentAtCommit({
      commitId: effectiveCommit.id,
      documentUuid: document.documentUuid,
    })
    .then((r) => r.unwrap())

  return {
    abTest,
    effectiveCommit,
    effectiveDocument,
    effectiveSource,
  }
}
