'use client'

import { ProgressIndicator } from '@latitude-data/web-ui'
import { isEvaluationRunDone } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/evaluations/[evaluationId]/_lib/isEvaluationRunDone'
import { type EventArgs } from '$/components/Providers/WebsocketsProvider/useSockets'

export function EvaluationStatusBanner({
  jobs,
}: {
  jobs: EventArgs<'evaluationStatus'>[]
}) {
  return (
    <>
      {jobs.map((job) => (
        <div key={job.batchId} className='flex flex-col gap-4'>
          {!isEvaluationRunDone(job) && (
            <ProgressIndicator state='running'>
              {`Running batch evaluation ${job.completed}/${job.total}`}
            </ProgressIndicator>
          )}
          {job.errors > 0 && (
            <ProgressIndicator state='error'>
              Some evaluations failed to run. We won't retry them automatically
              to avoid increasing provider costs. Total errors:{' '}
              <strong>{job.errors}</strong>
            </ProgressIndicator>
          )}
          {isEvaluationRunDone(job) && (
            <ProgressIndicator state='completed'>
              Batch evaluation completed! Total evaluations:{' '}
              <strong>{job.total}</strong> · Total errors:{' '}
              <strong>{job.errors}</strong> · Total completed:{' '}
              <strong>{job.completed}</strong>
            </ProgressIndicator>
          )}
        </div>
      ))}
    </>
  )
}
