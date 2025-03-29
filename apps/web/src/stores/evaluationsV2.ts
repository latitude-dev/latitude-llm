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
  EvaluationMetric,
  EvaluationOptions,
  EvaluationResultsV2Search,
  evaluationResultsV2SearchToQueryParams,
  EvaluationSettings,
  EvaluationType,
  EvaluationV2,
  EvaluationV2Stats,
  Project,
} from '@latitude-data/core'
import { useToast } from '@latitude-data/web-ui'
import { compact, isEmpty } from 'lodash-es'
import { useCallback, useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'

export function useEvaluationsV2(
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
      toast({
        title: 'Evaluation created successfully',
        description: `Evaluation ${evaluation.name} created successfully`,
      })
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
    async ({
      settings,
      options,
    }: {
      settings: EvaluationSettings
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
      toast({
        title: 'Evaluation updated successfully',
        description: `Evaluation ${evaluation.name} updated successfully`,
      })
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
    async ({
      evaluationUuid,
      settings,
      options,
    }: {
      evaluationUuid: string
      settings?: Partial<Omit<EvaluationSettings, 'type' | 'metric'>>
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
      toast({
        title: 'Evaluation deleted successfully',
        description: `Evaluation ${evaluation.name} deleted successfully`,
      })
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

export function useEvaluationV2Stats<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>(
  {
    project,
    commit,
    document,
    evaluation,
    search,
  }: {
    project: Pick<Project, 'id'>
    commit: Pick<Commit, 'uuid'>
    document: Pick<DocumentVersion, 'commitId' | 'documentUuid'>
    evaluation: Pick<EvaluationV2<T, M>, 'uuid'>
    search?: EvaluationResultsV2Search
  },
  opts?: SWRConfiguration,
) {
  const route = ROUTES.api.projects
    .detail(project.id)
    .commits.detail(commit.uuid)
    .documents.detail(document.documentUuid)
    .evaluationsV2.detail(evaluation.uuid).stats.root
  const query = useMemo(
    () => (search ? evaluationResultsV2SearchToQueryParams(search) : ''),
    [search],
  )
  const fetcher = useFetcher(`${route}?${query}`, {
    serializer: (data) => (isEmpty(data) ? undefined : data),
  })

  const { data = undefined, ...rest } = useSWR<EvaluationV2Stats>(
    compact([
      'evaluationV2Stats',
      project.id,
      commit.uuid,
      document.commitId,
      document.documentUuid,
      evaluation.uuid,
      query,
    ]),
    fetcher,
    opts,
  )

  return {
    data,
    ...rest,
  }
}
