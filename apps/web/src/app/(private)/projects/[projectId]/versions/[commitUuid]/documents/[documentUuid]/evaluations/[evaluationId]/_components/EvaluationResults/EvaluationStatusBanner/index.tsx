'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { EvaluationDto } from '@latitude-data/core/browser'
import { ProgressIndicator, useCurrentDocument } from '@latitude-data/web-ui'
import {
  useSockets,
  type EventArgs,
} from '$/components/Providers/WebsocketsProvider/useSockets'

const DISAPERING_IN_MS = 1500
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

          if (args.status && args.status === 'finished') {
            setTimeout(() => {
              setJobs((currentJobs) => {
                return currentJobs.filter((job) => job.batchId !== args.batchId)
              })
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
        <ProgressIndicator
          key={job.batchId}
          state={job.status === 'finished' ? 'completed' : 'running'}
        >
          {`Generating batch evaluation (ID: ${job.batchId}) ${job.completed}/${job.initialTotal}`}
        </ProgressIndicator>
      ))}
    </>
  )
}
