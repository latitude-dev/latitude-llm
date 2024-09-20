'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { EvaluationDto } from '@latitude-data/core/browser'
import { ProgressIndicator, useCurrentDocument } from '@latitude-data/web-ui'
import {
  useSockets,
  type EventArgs,
} from '$/components/Providers/WebsocketsProvider/useSockets'

const DISAPERING_IN_MS = 5000
export function EvaluationStatusBanner({
  evaluation,
}: {
  evaluation: EvaluationDto
}) {
  const timeoutRef = useRef<number | null>(null)
  const [jobs, setJobs] = useState<EventArgs<'evaluationStatus'>[]>([])
  const document = useCurrentDocument()

  const onMessage = useCallback(
    (args: EventArgs<'evaluationStatus'>) => {
      if (evaluation.id !== args.evaluationId) return
      if (document.documentUuid !== args.documentUuid) return

      setJobs((prevJobs) => {
        const jobIndex = prevJobs.findIndex(
          (job) => job.batchId === args.batchId,
        )

        if (jobIndex === -1) {
          return [...prevJobs, args]
        } else {
          const newJobs = [...prevJobs]
          newJobs[jobIndex] = args

          if (isDone(args)) {
            setTimeout(() => {
              setJobs((currentJobs) =>
                currentJobs.filter((job) => job.batchId !== args.batchId),
              )
            }, DISAPERING_IN_MS)
          }

          return newJobs
        }
      })
    },
    [evaluation.id, document.documentUuid],
  )

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  useSockets({ event: 'evaluationStatus', onMessage })

  return (
    <>
      {jobs.map((job) => (
        <div key={job.batchId} className='flex flex-col gap-4'>
          {!isDone(job) && (
            <ProgressIndicator state='running'>
              {`Running batch evaluation ${job.completed}/${job.total}`}
            </ProgressIndicator>
          )}
          {job.errors > 0 && !isDone(job) && (
            <ProgressIndicator state='error'>
              Some evaluations failed to run. We won't retry them automatically
              to avoid increasing provider costs. Total errors:{' '}
              <strong>{job.errors}</strong>
            </ProgressIndicator>
          )}
          {isDone(job) && (
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

function isDone(job: EventArgs<'evaluationStatus'>) {
  return job.total === job.completed + job.errors
}
