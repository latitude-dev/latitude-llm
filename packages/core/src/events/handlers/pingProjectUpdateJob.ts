import { findCommitById } from '../../data-access/commits'
import { pingProjectUpdate } from '../../services/projects'
import { EvaluationV2UpdatedEvent } from '../events'

export async function pingProjectUpdateJob({
  data: event,
}: {
  data: EvaluationV2UpdatedEvent
}) {
  const { evaluation } = event.data
  const commit = await findCommitById({ id: evaluation.commitId }).then((r) =>
    r.unwrap(),
  )
  if (!commit) return

  await pingProjectUpdate({ projectId: commit.projectId }).then((r) =>
    r.unwrap(),
  )
}
