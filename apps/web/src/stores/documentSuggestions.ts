'use client'

import { applyDocumentSuggestionAction } from '$/actions/documentSuggestions/apply'
import { discardDocumentSuggestionAction } from '$/actions/documentSuggestions/discard'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import { DocumentSuggestionWithDetails } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui'
import { compact } from 'lodash-es'
import { useCallback } from 'react'
import useSWR, { SWRConfiguration } from 'swr'

export default function useDocumentSuggestions(
  {
    projectId,
    commitUuid,
    documentUuid,
  }: {
    projectId: number
    commitUuid: string
    documentUuid: string
  },
  opts?: SWRConfiguration,
) {
  const { toast } = useToast()

  const fetcher = useFetcher(
    ROUTES.api.projects
      .detail(projectId)
      .commits.detail(commitUuid)
      .documents.detail(documentUuid).suggestions.root,
  )

  const {
    data = [],
    mutate,
    ...rest
  } = useSWR<DocumentSuggestionWithDetails[]>(
    compact(['documentSuggestions', projectId, commitUuid, documentUuid]),
    fetcher,
    opts,
  )

  const {
    execute: executeApplyDocumentSuggestion,
    isPending: isApplyingDocumentSuggestion,
  } = useLatitudeAction(applyDocumentSuggestionAction, {
    onSuccess: async ({ data: { suggestion } }) => {
      mutate((prev) => prev?.filter((s) => s.id !== suggestion.id))
    },
    onError: async (error) => {
      toast({
        title: 'Error applying suggestion',
        description: error?.err?.message,
        variant: 'destructive',
      })
    },
  })
  const applyDocumentSuggestion = useCallback(
    async ({
      suggestionId,
      prompt,
    }: {
      suggestionId: number
      prompt?: string
    }) => {
      const [result, error] = await executeApplyDocumentSuggestion({
        projectId: projectId,
        commitUuid: commitUuid,
        documentUuid: documentUuid,
        suggestionId: suggestionId,
        prompt: prompt,
      })
      if (error) return
      return result
    },
    [projectId, commitUuid, documentUuid, executeApplyDocumentSuggestion],
  )

  const {
    execute: executeDiscardDocumentSuggestion,
    isPending: isDiscardingDocumentSuggestion,
  } = useLatitudeAction(discardDocumentSuggestionAction, {
    onSuccess: async ({ data: { suggestion } }) => {
      mutate((prev) => prev?.filter((s) => s.id !== suggestion.id))
    },
    onError: async (error) => {
      toast({
        title: 'Error discarding suggestion',
        description: error?.err?.message,
        variant: 'destructive',
      })
    },
  })
  const discardDocumentSuggestion = useCallback(
    async ({ suggestionId }: { suggestionId: number }) => {
      const [result, error] = await executeDiscardDocumentSuggestion({
        projectId: projectId,
        commitUuid: commitUuid,
        documentUuid: documentUuid,
        suggestionId: suggestionId,
      })
      if (error) return
      return result
    },
    [projectId, commitUuid, documentUuid, executeDiscardDocumentSuggestion],
  )

  return {
    data,
    mutate,
    applyDocumentSuggestion,
    isApplyingDocumentSuggestion,
    discardDocumentSuggestion,
    isDiscardingDocumentSuggestion,
    isExecuting: isApplyingDocumentSuggestion || isDiscardingDocumentSuggestion,
    ...rest,
  }
}
