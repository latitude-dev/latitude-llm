'use client'

import {
  createEvaluationV2Action,
  deleteEvaluationV2Action,
  updateEvaluationV2Action,
} from '$/actions/evaluationsV2'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import {
  Commit,
  DocumentVersion,
  EvaluationConfiguration,
  EvaluationMetric,
  EvaluationOptions,
  EvaluationSettings,
  EvaluationType,
  EvaluationV2,
  Project,
} from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui'
import { compact } from 'lodash-es'
import { useCallback } from 'react'
import useSWR, { SWRConfiguration } from 'swr'

export default function useEvaluationsV2(
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

  const fetcher = useFetcher(
    ROUTES.api.projects
      .detail(project.id)
      .commits.detail(commit.uuid)
      .documents.detail(document.documentUuid).evaluationsV2.root,
  )

  const {
    data = [],
    mutate,
    ...rest
  } = useSWR<EvaluationV2[]>(
    compact([
      'evaluationsV2',
      project.id,
      commit.uuid,
      document.commitId,
      document.documentUuid,
    ]),
    fetcher,
    opts,
  )

  const {
    execute: executeCreateEvaluationV2,
    isPending: isCreatingEvaluation,
  } = useLatitudeAction(createEvaluationV2Action, {
    onSuccess: async ({ data: { evaluation } }) => {
      mutate((prev) => [evaluation, ...(prev ?? [])])
    },
    onError: async (error) => {
      toast({
        title: 'Error creating evaluation',
        description: error?.err?.message,
        variant: 'destructive',
      })
    },
  })
  const createEvaluation = useCallback(
    async <
      T extends EvaluationType,
      M extends EvaluationMetric<T>,
      C extends EvaluationConfiguration<M> = EvaluationConfiguration<M>,
    >({
      settings,
      options,
    }: {
      settings: EvaluationSettings<T, M, C>
      options?: Partial<EvaluationOptions>
    }) => {
      const [result, error] = await executeCreateEvaluationV2({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        settings: settings,
        options: options,
      })
      if (error) return
      return result
    },
    [project, commit, document, executeCreateEvaluationV2],
  )

  const {
    execute: executeUpdateEvaluationV2,
    isPending: isUpdatingEvaluation,
  } = useLatitudeAction(updateEvaluationV2Action, {
    onSuccess: async ({ data: { evaluation } }) => {
      mutate(
        (prev) =>
          prev?.map((e) => {
            if (e.uuid !== evaluation.uuid) return e
            return evaluation
          }) ?? [],
      )
    },
    onError: async (error) => {
      toast({
        title: 'Error updating evaluation',
        description: error?.err?.message,
        variant: 'destructive',
      })
    },
  })
  const updateEvaluation = useCallback(
    async <
      T extends EvaluationType,
      M extends EvaluationMetric<T>,
      C extends EvaluationConfiguration<M> = EvaluationConfiguration<M>,
    >({
      evaluationUuid,
      settings,
      options,
    }: {
      evaluationUuid: string
      settings?: Partial<Omit<EvaluationSettings<T, M, C>, 'type' | 'metric'>>
      options?: Partial<EvaluationOptions>
    }) => {
      const [result, error] = await executeUpdateEvaluationV2({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        evaluationUuid: evaluationUuid,
        settings: settings,
        options: options,
      })
      if (error) return
      return result
    },
    [project, commit, document, executeUpdateEvaluationV2],
  )

  const {
    execute: executeDeleteEvaluationV2,
    isPending: isDeletingEvaluation,
  } = useLatitudeAction(deleteEvaluationV2Action, {
    onSuccess: async ({ data: { evaluation } }) => {
      mutate((prev) => prev?.filter((e) => e.uuid !== evaluation.uuid) ?? [])
    },
    onError: async (error) => {
      toast({
        title: 'Error deleting evaluation',
        description: error?.err?.message,
        variant: 'destructive',
      })
    },
  })
  const deleteEvaluation = useCallback(
    async ({ evaluationUuid }: { evaluationUuid: string }) => {
      const [result, error] = await executeDeleteEvaluationV2({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        evaluationUuid: evaluationUuid,
      })
      if (error) return
      return result
    },
    [project, commit, document, executeDeleteEvaluationV2],
  )

  return {
    data,
    mutate,
    createEvaluation,
    isCreatingEvaluation,
    updateEvaluation,
    isUpdatingEvaluation,
    deleteEvaluation,
    isDeletingEvaluation,
    isExecuting:
      isCreatingEvaluation || isUpdatingEvaluation || isDeletingEvaluation,
    ...rest,
  }
}
