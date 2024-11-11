'use client'

import { generateSuggestedEvaluationsAction } from '$/actions/evaluations/generateSuggestedEvaluations'
import useSWR, { SWRConfiguration } from 'swr'

export interface SuggestedEvaluation {
  eval_name: string
  eval_description: string
  eval_type: 'number' | 'boolean'
  eval_objective: string
  eval_additional_instructions?: string
  metadata:
    | {
        minValue: number
        maxValue: number
        minValueDescription?: string
        maxValueDescription?: string
      }
    | {
        falseValueDescription?: string
        trueValueDescription?: string
      }
}

export default function useSuggestedEvaluation(
  documentContent?: string | null,
  opts?: SWRConfiguration,
) {
  const { data, error, isLoading } = useSWR<SuggestedEvaluation | undefined>(
    [
      'suggestedEvaluations',
      documentContent ? documentContent.slice(-100) : null,
    ],
    async () => {
      if (!documentContent) return undefined

      const [data, error] = await generateSuggestedEvaluationsAction({
        documentContent,
      })

      if (error) return undefined

      return data
    },
    opts,
  )

  return {
    data,
    isLoading,
    error,
  }
}
