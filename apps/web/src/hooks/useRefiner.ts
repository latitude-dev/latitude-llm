'use client'

import { refineApplyAction } from '$/actions/copilot/refineApply'
import { refinePromptAction } from '$/actions/copilot/refinePrompt'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { Commit, DocumentVersion, Project } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { RefObject, useCallback } from 'react'

export type Refinement = {
  prompt: string
  summary: string
}

export function useRefiner(
  {
    project,
    commit,
    document,
  }: {
    project: Pick<Project, 'id'>
    commit: Pick<Commit, 'uuid'>
    document: Pick<DocumentVersion, 'commitId' | 'documentUuid'>
  },
  cancelled?: RefObject<boolean>,
) {
  const { toast } = useToast()

  const { execute: executeRefinePrompt, isPending: isRefiningPrompt } =
    useLatitudeAction(refinePromptAction, {
      onSuccess: async () => {
        if (cancelled?.current) return
        toast({
          title: 'Prompt refined ✨',
          description: 'View the suggestion in the editor',
        })
      },
      onError: async (error) => {
        if (cancelled?.current) return
        toast({
          title: 'Error refining prompt',
          description: error?.message,
          variant: 'destructive',
        })
      },
    })
  const refinePrompt = useCallback(
    async ({
      evaluationUuid,
      resultUuids,
    }: {
      evaluationUuid?: string
      resultUuids?: string[]
    }) => {
      return await executeRefinePrompt({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        evaluationUuid: evaluationUuid,
        resultUuids: resultUuids,
      })
    },
    [project, commit, document, executeRefinePrompt],
  )

  const { execute: executeRefineApply, isPending: isApplyingRefine } =
    useLatitudeAction(refineApplyAction, {
      onSuccess: async () => {}, // Avoid toast
      onError: async (error) => {
        if (cancelled?.current) return
        toast({
          title: 'Error applying refinement',
          description: error?.message,
          variant: 'destructive',
        })
      },
    })
  const refineApply = useCallback(
    async ({ prompt }: { prompt: string }) => {
      return await executeRefineApply({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        prompt: prompt,
      })
    },
    [project, commit, document, executeRefineApply],
  )

  return {
    refinePrompt,
    refineApply,
    isRefiningPrompt,
    isApplyingRefine,
    isExecuting: isRefiningPrompt || isApplyingRefine,
  }
}
