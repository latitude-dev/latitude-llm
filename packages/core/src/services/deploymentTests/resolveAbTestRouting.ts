import { LogSources } from '@latitude-data/constants'
import {
  CommitsRepository,
  DeploymentTestsRepository,
} from '../../repositories'
import { routeRequest } from './routeRequest'
import { Commit } from '../../schema/models/types/Commit'
import { DeploymentTest } from '../../schema/models/types/DeploymentTest'

export type ResolveAbTestRoutingResult = {
  abTest: DeploymentTest | null
  effectiveCommit: Commit
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
 * @param params.source - The original log source from the request
 * @param params.customIdentifier - Optional custom identifier for A/B test routing
 * @returns Object containing:
 *   - abTest: Active A/B test (if any)
 *   - effectiveCommit: Commit to use (may differ from original for A/B tests)
 *   - effectiveSource: Log source (updated to reflect baseline/challenger for A/B tests)
 */
export async function resolveAbTestRouting({
  workspaceId,
  projectId,
  commit,
  source,
  customIdentifier,
}: {
  workspaceId: number
  projectId: number
  commit: Commit
  source: LogSources
  customIdentifier?: string | null
}): Promise<ResolveAbTestRoutingResult> {
  const deploymentTestsRepo = new DeploymentTestsRepository(workspaceId)
  const commitsRepo = new CommitsRepository(workspaceId)

  // Find all active tests for the project
  const allActiveTests =
    await deploymentTestsRepo.findAllActiveForProject(projectId)

  // Get the head commit (baseline is always the head commit)
  const headCommit = await commitsRepo.getHeadCommit(projectId)
  const isHeadCommit = headCommit?.id === commit.id

  // Find active AB test
  // A test is relevant if:
  // 1. Commit is the head commit (baseline) - any test targeting this project
  // 2. Commit is the challenger commit for the test
  const abTest = allActiveTests.find(
    (test) =>
      test.testType === 'ab' &&
      (isHeadCommit || test.challengerCommitId === commit.id),
  )

  // If no AB test, no routing needed
  if (!abTest) {
    return {
      abTest: null,
      effectiveCommit: commit,
      effectiveSource: source,
    }
  }

  // Determine which variant to route to for AB test
  const routedTo = routeRequest(abTest, customIdentifier)

  if (!headCommit) {
    // If no head commit, fall back to original commit
    return {
      abTest,
      effectiveCommit: commit,
      effectiveSource: source,
    }
  }

  // Determine the commit and log source based on routing
  const commitIdToUse =
    routedTo === 'baseline' ? headCommit.id : abTest.challengerCommitId

  const effectiveSource =
    routedTo === 'baseline' ? source : LogSources.ABTestChallenger

  if (commitIdToUse === commit.id) {
    return {
      abTest,
      effectiveCommit: commit,
      effectiveSource,
    }
  }

  const effectiveCommit = await commitsRepo
    .getCommitById(commitIdToUse)
    .then((r) => r.unwrap())

  return {
    abTest,
    effectiveCommit,
    effectiveSource,
  }
}
