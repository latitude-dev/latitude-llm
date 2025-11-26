import { MINIMUM_MONTLY_ANNOTATIONS } from '@latitude-data/constants/issues'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { getAnnotationsProgressCount } from '../../data-access/issues/getAnnotationsProgress'
import { NotFoundError } from '../../lib/errors'
import { CommitsRepository } from '../../repositories'
import { toggleIssuesUnlocked } from '../../services/workspaces/toggleIssuesUnlocked'
import { EvaluationV2AnnotatedEvent } from '../events'

/**
 * Unlocks the issues dashboard UI when a workspace reaches the minimum
 * monthly annotations threshold via HITL evaluations.
 */
export const unlockIssuesDashboardOnAnnotation = async ({
  data: event,
}: {
  data: EvaluationV2AnnotatedEvent
}) => {
  const { workspaceId, commit, userEmail } = event.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  if (workspace.issuesUnlocked) return

  const commitsRepo = new CommitsRepository(workspace.id)
  const commits = await commitsRepo.getCommitsHistory({ commit })
  const commitIds = commits.map((c) => c.id)

  const annotationsCount = await getAnnotationsProgressCount({
    workspace,
    commitIds,
  })

  if (annotationsCount < MINIMUM_MONTLY_ANNOTATIONS) return

  await toggleIssuesUnlocked({
    workspace,
    enabled: true,
    currentUserEmail: userEmail ?? null,
    source: 'annotation',
    projectId: commit.projectId,
  })
}
