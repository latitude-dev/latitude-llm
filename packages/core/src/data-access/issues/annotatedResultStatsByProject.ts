import {
  EvaluationResultsV2Repository,
  IssuesRepository,
} from '../../repositories'
import { Project } from '../../schema/models/types/Project'

export async function annotatedResultStatsByProject({
  project,
}: {
  project: Project
}) {
  const issuesRepo = new IssuesRepository(project.workspaceId)
  const evalResultRepo = new EvaluationResultsV2Repository(project.workspaceId)
  const issuesCount = await issuesRepo.countByProject({ project })
  const annotatedCount =
    await evalResultRepo.failedManuallyAnnotatedCountByProject({ project })

  return {
    issuesCount,
    annotatedCount,
  }
}
