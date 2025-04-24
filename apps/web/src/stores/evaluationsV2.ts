'use client'

import {
  cloneEvaluationV2Action,
  createEvaluationV2Action,
  deleteEvaluationV2Action,
  generateEvaluationV2Action,
  toggleLiveModeAction,
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
} from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
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

  const fetcher = useFetcher<EvaluationV2[]>(
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
      if (error?.err?.name === 'ZodError') return
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
      return await executeCreateEvaluationV2({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        settings: settings,
        options: options,
      })
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
      if (error?.err?.name === 'ZodError') return
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
      return await executeUpdateEvaluationV2({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        evaluationUuid: evaluationUuid,
        settings: settings,
        options: options,
      })
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
      if (error?.err?.name === 'ZodError') return
      toast({
        title: 'Error deleting evaluation',
        description: error?.err?.message,
        variant: 'destructive',
      })
    },
  })
  const deleteEvaluation = useCallback(
    async ({ evaluationUuid }: { evaluationUuid: string }) => {
      return await executeDeleteEvaluationV2({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        evaluationUuid: evaluationUuid,
      })
    },
    [project, commit, document, executeDeleteEvaluationV2],
  )

  const {
    execute: executeGenerateEvaluationV2,
    isPending: isGeneratingEvaluation,
  } = useLatitudeAction(generateEvaluationV2Action, {
    onSuccess: async ({ data: { settings } }) => {
      toast({
        title: 'Evaluation generated successfully',
        description: `Evaluation ${settings.name} generated successfully`,
      })
    },
    onError: async (error) => {
      if (error?.err?.name === 'ZodError') return
      toast({
        title: 'Error generating evaluation',
        description: error?.err?.message,
        variant: 'destructive',
      })
    },
  })
  const generateEvaluation = useCallback(
    async ({ instructions }: { instructions?: string }) => {
      return await executeGenerateEvaluationV2({
        instructions: instructions,
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
      })
    },
    [project, commit, document, executeGenerateEvaluationV2],
  )

  const { execute: executeCloneEvaluationV2, isPending: isCloningEvaluation } =
    useLatitudeAction(cloneEvaluationV2Action, {
      onSuccess: async ({ data: { evaluation } }) => {
        mutate((prev) => [evaluation, ...(prev ?? [])])
        toast({
          title: 'Evaluation cloned successfully',
          description: `Evaluation ${evaluation.name} cloned successfully`,
        })
      },
      onError: async (error) => {
        if (error?.err?.name === 'ZodError') return
        toast({
          title: 'Error cloning evaluation',
          description: error?.err?.message,
          variant: 'destructive',
        })
      },
    })
  const cloneEvaluation = useCallback(
    async ({ evaluationUuid }: { evaluationUuid: string }) => {
      return await executeCloneEvaluationV2({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        evaluationUuid: evaluationUuid,
      })
    },
    [project, commit, document, executeCloneEvaluationV2],
  )

  const { execute: executeToggleLiveMode, isPending: isTogglingLiveMode } =
    useLatitudeAction(toggleLiveModeAction, {
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
        if (error?.err?.name === 'ZodError') return
        toast({
          title: 'Error updating evaluation',
          description: error?.err?.message,
          variant: 'destructive',
        })
      },
    })
  const toggleLiveMode = useCallback(
    async ({
      evaluationUuid,
      live,
    }: {
      evaluationUuid: string
      live: boolean
    }) => {
      return await executeToggleLiveMode({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        evaluationUuid: evaluationUuid,
        live: live,
      })
    },
    [project, commit, document, executeToggleLiveMode],
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
    generateEvaluation,
    isGeneratingEvaluation,
    toggleLiveMode,
    isTogglingLiveMode,
    cloneEvaluation,
    isCloningEvaluation,
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
  const fetcher = useFetcher<EvaluationV2Stats | undefined, EvaluationV2Stats>(
    `${route}?${query}`,
    {
      serializer: (data) => (isEmpty(data) ? undefined : data),
    },
  )

  const { data = undefined, ...rest } = useSWR<EvaluationV2Stats | undefined>(
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
