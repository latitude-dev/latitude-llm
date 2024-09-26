'use client'

import { useEffect, useRef, useState } from 'react'

import { ProgressIndicator } from '@latitude-data/web-ui'
import { type EventArgs } from '$/components/Providers/WebsocketsProvider/useSockets'

import { isEvaluationRunDone } from '../../../_lib/isEvaluationRunDone'
import { useEvaluationStatusEvent } from '../../../_lib/useEvaluationStatusEvent'

const DISAPERING_IN_MS = 5000

export function EvaluationStatusBanner({
  documentUuid,
  evaluationId,
}: {
  evaluationId: number
  documentUuid: string
}) {
  const timeoutRef = useRef<number | null>(null)
  const [jobs, setJobs] = useState<EventArgs<'evaluationStatus'>[]>([])
  useEvaluationStatusEvent({
    evaluationId,
    documentUuid,
    onStatusChange: (args) => {
      setJobs((prevJobs) => {
        const jobIndex = prevJobs.findIndex(
          (job) => job.batchId === args.batchId,
        )

        if (jobIndex === -1) {
          return [...prevJobs, args]
        } else {
          const newJobs = [...prevJobs]
          newJobs[jobIndex] = args

          if (isEvaluationRunDone(args)) {
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
  })

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

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
