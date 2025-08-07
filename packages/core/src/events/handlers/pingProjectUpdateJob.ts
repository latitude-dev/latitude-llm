import { NotFoundError } from '@latitude-data/constants/errors'
import { findCommitById } from '../../data-access/commits'
import { Result } from '../../lib/Result'
import { pingProjectUpdate } from '../../services/projects'
import type {
  EvaluationV2CreatedEvent,
  EvaluationV2DeletedEvent,
  EvaluationV2UpdatedEvent,
} from '../events'

export async function pingProjectUpdateJob({
  data: event,
}: {
  data: EvaluationV2CreatedEvent | EvaluationV2UpdatedEvent | EvaluationV2DeletedEvent
}) {
  const { evaluation } = event.data
  const commit = await findCommitById(evaluation.commitId)
  if (!commit) return Result.error(new NotFoundError('Commit not found'))

  await pingProjectUpdate({ projectId: commit.projectId }).then((r) => r.unwrap())
}
