'use client'

import { applyDocumentSuggestionAction } from '$/actions/documentSuggestions/apply'
import { discardDocumentSuggestionAction } from '$/actions/documentSuggestions/discard'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { compact } from 'lodash-es'
import { useCallback } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import { DocumentSuggestionWithDetails } from '@latitude-data/core/schema/models/types/DocumentSuggestion'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { Project } from '@latitude-data/core/schema/models/types/Project'
export default function useDocumentSuggestions(
  {
    project,
    commit,
    document,
  }: {
    project: Pick<Project, 'id'>
    commit: Pick<Commit, 'uuid'>
    document: Pick<DocumentVersion, 'commitId' | 'documentUuid'>
  },
  opts?: SWRConfiguration,
) {
  const { toast } = useToast()

  const fetcher = useFetcher<DocumentSuggestionWithDetails[]>(
    ROUTES.api.projects
      .detail(project.id)
      .commits.detail(commit.uuid)
      .documents.detail(document.documentUuid).suggestions.root,
  )

  const {
    data = [],
    mutate,
    ...rest
  } = useSWR<DocumentSuggestionWithDetails[]>(
    compact([
      'documentSuggestions',
      project.id,
      commit.uuid,
      document.commitId,
      document.documentUuid,
    ]),
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
        description: error?.message,
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
      return await executeApplyDocumentSuggestion({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        suggestionId: suggestionId,
        prompt: prompt,
      })
    },
    [project, commit, document, executeApplyDocumentSuggestion],
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
        description: error?.message,
        variant: 'destructive',
      })
    },
  })
  const discardDocumentSuggestion = useCallback(
    async ({ suggestionId }: { suggestionId: number }) => {
      return await executeDiscardDocumentSuggestion({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        suggestionId: suggestionId,
      })
    },
    [project, commit, document, executeDiscardDocumentSuggestion],
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
