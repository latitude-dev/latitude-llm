'use client'

import { useEffect, useRef, useState } from 'react'

import { type EventArgs } from '$/components/Providers/WebsocketsProvider/useSockets'
import { EvaluationDto } from '@latitude-data/core/browser'
import { Badge, Text } from '@latitude-data/web-ui'

import { isEvaluationRunDone } from '../../../_lib/isEvaluationRunDone'
import { useEvaluationStatusEvent } from '../../../_lib/useEvaluationStatusEvent'

const DISAPERING_IN_MS = 5000

function BatchIndicator({ job }: { job: EventArgs<'evaluationStatus'> }) {
  const isDone = isEvaluationRunDone(job)
  const badgeLabel = isDone ? 'Finished' : 'Running'
  const doneRuns = job.completed + job.errors
  return (
    <div className='flex flex-row items-center gap-x-4'>
      <Badge variant={isDone ? 'muted' : 'accent'}>{badgeLabel}</Badge>
      <div className='flex flex-row items-center gap-x-2'>
        <Text.H5>{`${doneRuns} of ${job.total} generated`}</Text.H5>
        {job.errors > 0 ? (
          <>
            <Text.H5 color='foregroundMuted'>·</Text.H5>
            <Text.H5 color='destructiveMutedForeground'>
              {job.errors} Errors
            </Text.H5>
          </>
        ) : null}
      </div>
    </div>
  )
}

export function EvaluationStatusBanner({
  documentUuid,
  evaluation,
}: {
  documentUuid: string
  evaluation: EvaluationDto
}) {
  const timeoutRef = useRef<number | null>(null)
  const [jobs, setJobs] = useState<EventArgs<'evaluationStatus'>[]>([])

  useEvaluationStatusEvent({
    evaluation: { ...evaluation, version: 'v1' },
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
        <div
          key={job.batchId}
          className='flex flex-col gap-4 p-4 rounded-lg border border-border'
        >
          <BatchIndicator job={job} />
        </div>
      ))}
    </>
  )
}
