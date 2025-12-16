'use client'

import {
  annotateEvaluationV2Action,
  cloneEvaluationV2Action,
  createEvaluationV2Action,
  deleteEvaluationV2Action,
  generateEvaluationV2Action,
  updateEvaluationV2Action,
} from '$/actions/evaluationsV2'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { compact, isEmpty } from 'lodash-es'
import { useCallback, useMemo } from 'react'
import useSWR, { SWRConfiguration, useSWRConfig } from 'swr'
import { EvaluationV2Stats } from '@latitude-data/core/schema/types'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import {
  EvaluationMetric,
  EvaluationOptions,
  EvaluationResultMetadata,
  EvaluationSettings,
  EvaluationType,
  EvaluationV2,
} from '@latitude-data/core/constants'
import {
  EvaluationResultsV2Search,
  evaluationResultsV2SearchToQueryParams,
} from '@latitude-data/core/helpers'
import { generateEvaluationV2FromIssueAction } from '$/actions/evaluationsV2/generateFromIssue'

export function useEvaluationsV2(
  {
    project,
    commit,
    document,
    notifyUpdate = true,
  }: {
    project: Pick<Project, 'id'>
    commit: Pick<Commit, 'uuid'>
    document?: Pick<DocumentVersion, 'commitId' | 'documentUuid'>
    notifyUpdate?: boolean
  },
  opts?: SWRConfiguration,
) {
  const { toast } = useToast()
  const { mutate: globalMutate } = useSWRConfig()
  const fetcher = useFetcher<EvaluationV2[]>(ROUTES.api.evaluations.root, {
    searchParams: {
      projectId: project.id.toString(),
      commitUuid: commit.uuid,
      ...(document && { documentUuid: document.documentUuid }),
    },
  })
  const {
    data = [],
    isLoading,
    mutate,
  } = useSWR<EvaluationV2[]>(
    compact([
      'evaluationsV2',
      project.id,
      commit.uuid,
      document?.commitId,
      document?.documentUuid,
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
      globalMutate(
        (key) =>
          Array.isArray(key) &&
          key[0] === 'issueEvaluations' &&
          key[1] === project.id &&
          key[2] === commit.uuid,
      )
      toast({
        title: 'Evaluation created successfully',
        description: `Evaluation ${evaluation.name} created successfully`,
      })
    },
    onError: async (error) => {
      if (error.code === 'ERROR') {
        toast({
          title: 'Error creating evaluation',
          description: error?.message,
          variant: 'destructive',
        })
      }
    },
  })
  const createEvaluation = useCallback(
    async ({
      documentUuid,
      settings,
      options,
      issueId,
    }: {
      documentUuid: string
      settings: EvaluationSettings
      options?: Partial<EvaluationOptions>
      issueId?: number | null
    }) => {
      return await executeCreateEvaluationV2({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid,
        settings: settings,
        options: options,
        issueId: issueId,
      })
    },
    [project, commit, executeCreateEvaluationV2],
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
      globalMutate(
        (key) =>
          Array.isArray(key) &&
          key[0] === 'issueEvaluations' &&
          key[1] === project.id &&
          key[2] === commit.uuid,
      )
      if (!notifyUpdate) return
      toast({
        title: 'Evaluation updated successfully',
        description: `Evaluation ${evaluation.name} updated successfully`,
      })
    },
    onError: async (error) => {
      if (!notifyUpdate) return
      if (error.code === 'ERROR') {
        toast({
          title: 'Error updating evaluation',
          description: error?.message,
          variant: 'destructive',
        })
      }
    },
  })
  const updateEvaluation = useCallback(
    async ({
      evaluationUuid,
      documentUuid,
      settings,
      options,
      issueId,
    }: {
      evaluationUuid: string
      documentUuid: string
      settings?: Partial<Omit<EvaluationSettings, 'type' | 'metric'>>
      options?: Partial<EvaluationOptions>
      issueId?: number | null
    }) => {
      return await executeUpdateEvaluationV2({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid,
        evaluationUuid: evaluationUuid,
        settings: settings,
        options: options,
        issueId: issueId,
      })
    },
    [project, commit, executeUpdateEvaluationV2],
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
      if (error.code === 'ERROR') {
        toast({
          title: 'Error deleting evaluation',
          description: error?.message,
          variant: 'destructive',
        })
      }
    },
  })
  const deleteEvaluation = useCallback(
    async ({
      evaluationUuid,
      documentUuid,
    }: {
      evaluationUuid: string
      documentUuid: string
    }) => {
      return await executeDeleteEvaluationV2({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid,
        evaluationUuid: evaluationUuid,
      })
    },
    [project, commit, executeDeleteEvaluationV2],
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
      if (error.code === 'ERROR') {
        toast({
          title: 'Error generating evaluation',
          description: error?.message,
          variant: 'destructive',
        })
      }
    },
  })

  const generateEvaluation = useCallback(
    async ({
      documentUuid,
      instructions,
    }: {
      documentUuid: string
      instructions?: string
    }) => {
      return await executeGenerateEvaluationV2({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid,
        instructions: instructions,
      })
    },
    [project, commit, executeGenerateEvaluationV2],
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
        if (error.code === 'ERROR') {
          toast({
            title: 'Error cloning evaluation',
            description: error?.message,
            variant: 'destructive',
          })
        }
      },
    })

  const cloneEvaluation = useCallback(
    async ({
      evaluationUuid,
      documentUuid,
    }: {
      evaluationUuid: string
      documentUuid: string
    }) => {
      return await executeCloneEvaluationV2({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid,
        evaluationUuid: evaluationUuid,
      })
    },
    [project, commit, executeCloneEvaluationV2],
  )

  const {
    execute: executeAnnotateEvaluationV2,
    isPending: isAnnotatingEvaluation,
  } = useLatitudeAction(annotateEvaluationV2Action, {
    onSuccess: async () => {
      // no-op
    },
    onError: async (error) => {
      if (error.code === 'ERROR') {
        toast({
          title: 'Error annotating evaluation',
          description: error?.message,
          variant: 'destructive',
        })
      }
    },
  })

  const annotateEvaluation = useCallback(
    async ({
      evaluationUuid,
      documentUuid,
      resultScore,
      resultMetadata,
      spanId,
      traceId,
    }: {
      evaluationUuid: string
      documentUuid: string
      resultScore: number
      spanId: string
      traceId: string
      resultMetadata?: Partial<EvaluationResultMetadata>
    }) => {
      return await executeAnnotateEvaluationV2({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid,
        evaluationUuid: evaluationUuid,
        resultScore: resultScore,
        resultMetadata: resultMetadata,
        spanId,
        traceId,
      })
    },
    [project, commit, executeAnnotateEvaluationV2],
  )

  const {
    execute: executeGenerateEvaluationV2FromIssue,
    isPending: isGeneratingEvaluationFromIssue,
  } = useLatitudeAction(generateEvaluationV2FromIssueAction, {
    onSuccess: async () => {
      // no-op
    },
    onError: async (error) => {
      if (error.code === 'ERROR') {
        toast({
          title: 'Error generating evaluation from issue',
          description: error?.message,
          variant: 'destructive',
        })
      }
    },
  })

  const generateEvaluationFromIssue = useCallback(
    async ({
      documentUuid,
      issueId,
      providerName,
      model,
    }: {
      documentUuid: string
      issueId: number
      providerName: string
      model: string
    }) => {
      return await executeGenerateEvaluationV2FromIssue({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid,
        issueId: issueId,
        providerName: providerName,
        model: model,
      })
    },
    [project, commit, executeGenerateEvaluationV2FromIssue],
  )

  return useMemo(
    () => ({
      data,
      mutate,
      isLoading,
      createEvaluation,
      isCreatingEvaluation,
      updateEvaluation,
      isUpdatingEvaluation,
      deleteEvaluation,
      isDeletingEvaluation,
      generateEvaluation,
      isGeneratingEvaluation,
      cloneEvaluation,
      isCloningEvaluation,
      annotateEvaluation,
      isAnnotatingEvaluation,
      generateEvaluationFromIssue,
      isGeneratingEvaluationFromIssue,
    }),
    [
      data,
      mutate,
      isLoading,
      createEvaluation,
      isCreatingEvaluation,
      updateEvaluation,
      isUpdatingEvaluation,
      deleteEvaluation,
      isDeletingEvaluation,
      generateEvaluation,
      isGeneratingEvaluation,
      cloneEvaluation,
      isCloningEvaluation,
      annotateEvaluation,
      isAnnotatingEvaluation,
      generateEvaluationFromIssue,
      isGeneratingEvaluationFromIssue,
    ],
  )
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
    .evaluations.detail(evaluation.uuid).stats.root
  const query = useMemo(
    () =>
      search
        ? evaluationResultsV2SearchToQueryParams({
            ...search,
            // Note: no need to react to pagination changes
            pagination: { page: 0, pageSize: 0 },
          })
        : '',
    [search],
  )
  const fetcher = useFetcher<EvaluationV2Stats | undefined, EvaluationV2Stats>(
    `${route}?${query}`,
    {
      serializer: (data) => (isEmpty(data) ? undefined : data),
    },
  )

  const {
    data = undefined,
    mutate,
    isLoading,
  } = useSWR<EvaluationV2Stats | undefined>(
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

  return useMemo(
    () => ({
      data,
      mutate,
      isLoading,
    }),
    [data, mutate, isLoading],
  )
}
