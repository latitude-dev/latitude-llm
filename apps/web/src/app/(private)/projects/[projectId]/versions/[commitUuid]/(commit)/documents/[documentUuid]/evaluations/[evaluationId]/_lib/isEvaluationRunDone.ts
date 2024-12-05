import { type EventArgs } from '$/components/Providers/WebsocketsProvider/useSockets'

export function isEvaluationRunDone(job: EventArgs<'evaluationStatus'>) {
  return job.total === job.completed + job.errors
}
