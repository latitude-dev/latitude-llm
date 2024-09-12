'use client'

import type { DocumentVersion, Evaluation } from '@latitude-data/core/browser'
import { useSession, useToast } from '@latitude-data/web-ui'
import { fetchConnectedDocumentsAction } from '$/actions/connectedEvaluations/fetchConnectedDocuments'
import useSWR, { SWRConfiguration } from 'swr'

export default function useConnectedDocuments(
  {
    evaluation,
  }: {
    evaluation: Evaluation
  },
  opts: SWRConfiguration = {},
) {
  const { workspace } = useSession()
  const { toast } = useToast()

  const {
    data = [],
    isLoading,
    error,
  } = useSWR<DocumentVersion[]>(
    ['connectedDocuments', workspace.id, evaluation.id],
    async () => {
      const [data, error] = await fetchConnectedDocumentsAction({
        evaluationId: evaluation.id,
      })

      if (error) {
        console.error(error)

        toast({
          title: 'Error fetching evaluation connections',
          description: error.formErrors?.[0] || error.message,
          variant: 'destructive',
        })
        throw error
      }

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
