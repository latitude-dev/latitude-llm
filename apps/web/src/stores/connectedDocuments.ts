'use client'

import type { DocumentVersion, Evaluation } from '@latitude-data/core/browser'
import { useSession, useToast } from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
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
      const response = await fetch(
        ROUTES.api.evaluations.detail(evaluation.id).connectedDocuments.root,
      )

      if (!response.ok) {
        const error = await response.json()

        toast({
          title: 'Error fetching evaluation connections',
          description: error.formErrors?.[0] || error.message,
          variant: 'destructive',
        })

        return []
      }

      return await response.json()
    },
    opts,
  )

  return {
    data,
    isLoading,
    error,
  }
}
