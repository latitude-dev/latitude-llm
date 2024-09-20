import { useCallback, useEffect, useRef, useState } from 'react'

import { Evaluation } from '@latitude-data/core/browser'
import { useCurrentDocument } from '@latitude-data/web-ui'
import {
  useSockets,
  type EventArgs,
} from '$/components/Providers/WebsocketsProvider/useSockets'

import { isEvaluationRunDone } from '../../_lib/isEvaluationRunDone'
import { useRefetchStats } from './useRefetchStats'

const DISAPERING_IN_MS = 5000

export function useEvaluationStatus({
  evaluation,
}: {
  evaluation: Evaluation
}) {
  const timeoutRef = useRef<number | null>(null)
  const [jobs, setJobs] = useState<EventArgs<'evaluationStatus'>[]>([])
  const document = useCurrentDocument()
  const { refetchStats } = useRefetchStats({ evaluation, document })
  const onMessage = useCallback(
    (args: EventArgs<'evaluationStatus'>) => {
      if (evaluation.id !== args.evaluationId) return
      if (document.documentUuid !== args.documentUuid) return

      const done = isEvaluationRunDone(args)

      if (done) {
        refetchStats()
      }

      setJobs((prevJobs) => {
        const jobIndex = prevJobs.findIndex(
          (job) => job.batchId === args.batchId,
        )

        if (jobIndex === -1) {
          return [...prevJobs, args]
        } else {
          const newJobs = [...prevJobs]
          newJobs[jobIndex] = args

          if (done) {
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
    [evaluation.id, document.documentUuid, refetchStats],
  )

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  useSockets({ event: 'evaluationStatus', onMessage })

  return { jobs }
}
