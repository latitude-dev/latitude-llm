'use client'

import { generateSuggestedEvaluationsAction } from '$/actions/evaluations/generateSuggestedEvaluations'
import useSWR, { SWRConfiguration } from 'swr'

export interface SuggestedEvaluation {
  id: number
  title: string
  description: string
}

export default function useSuggestedEvaluations(
  documentContent?: string | null,
  opts?: SWRConfiguration,
) {
  const { data, error, isLoading } = useSWR<SuggestedEvaluation[]>(
    [
      'suggestedEvaluations',
      documentContent ? documentContent.slice(-100) : null,
    ],
    async () => {
      if (!documentContent) return []

      const [data, error] = await generateSuggestedEvaluationsAction({
        documentContent,
      })

      if (error) return []

      return data
    },
    opts,
  )

  return {
    data: data || [],
    isLoading,
    error,
  }
}
