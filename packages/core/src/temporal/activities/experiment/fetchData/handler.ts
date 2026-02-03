import { unsafelyFindWorkspace } from '../../../../data-access/workspaces'
import { NotFoundError } from '../../../../lib/errors'
import { ExperimentsRepository } from '../../../../repositories'
import { getExperimentJobPayload } from '../../../../services/experiments/start/getExperimentJobPayload'

export async function fetchExperimentDataActivityHandler({
  workspaceId,
  experimentUuid,
}: {
  workspaceId: number
  experimentUuid: string
}) {
  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) {
    throw new NotFoundError(`Workspace not found: ${workspaceId}`)
  }

  const experimentsRepository = new ExperimentsRepository(workspace.id)
  const experiment = await experimentsRepository
    .findByUuid(experimentUuid)
    .then((r) => r.unwrap())

  const payloadResult = await getExperimentJobPayload({ experiment, workspace })
  if (payloadResult.error) {
    throw payloadResult.error
  }

  const { project, commit, document, rows } = payloadResult.unwrap()

  return {
    experiment,
    project,
    commit,
    document,
    rows,
    evaluationUuids: experiment.evaluationUuids,
  }
}
