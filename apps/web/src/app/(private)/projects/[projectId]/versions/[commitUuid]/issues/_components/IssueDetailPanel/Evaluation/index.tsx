'use client'

import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import React, { useCallback, useMemo, useState } from 'react'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { Icon, IconProps } from '@latitude-data/web-ui/atoms/Icons'
import { getEvaluationMetricSpecification } from '$/components/evaluations'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Issue } from '@latitude-data/core/schema/models/types/Issue'
import { EvaluationModal } from './EvaluationModal'
import { ProviderApiKey } from '@latitude-data/core/schema/models/types/ProviderApiKey'
import { useActiveEvaluations } from '$/stores/activeEvaluations'
import { toast } from 'node_modules/@latitude-data/web-ui/src/ds/atoms/Toast/useToast'
import { useTypeWriterValue } from '@latitude-data/web-ui/browser'
import { scan } from 'promptl-ai'
import useProviderApiKeys from '$/stores/providerApiKeys'
import useDocumentVersion from '$/stores/useDocumentVersion'
import Link from 'next/link'
import { ROUTES } from '$/services/routes'
import { useEnoughAnnotationsForIssue } from '$/stores/issues/enoughAnnotationsForIssue'
import {
  MINIMUM_NEGATIVE_ANNOTATIONS_FOR_THIS_ISSUE,
  MINIMUM_POSITIVE_OR_OTHER_NEGATIVE_ANNOTATIONS_FOR_OTHER_ISSUES,
} from '@latitude-data/constants/issues'

const GENERATION_DESCRIPTIONS = [
  'Thinking of a good configuration...',
  'Validating its effectiveness...',
  'Trying a different approach...',
  'Validating the new approach...',
  'Found it! Creating the evaluation...',
]

const ENDED_EVALUATION_DESCRIPTION_DELAY = 3000

// TODO(evaluation-generation): Separate each case into a separate component
export function IssueEvaluation({ issue }: { issue: Issue }) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const {
    data: evaluations,
    isLoading: isLoadingEvaluations,
    updateEvaluation,
    isUpdatingEvaluation,
    generateEvaluationFromIssue,
    mutate: mutateEvaluations,
  } = useEvaluationsV2({
    project: project,
    commit: commit,
    document: {
      commitId: commit.id,
      documentUuid: issue.documentUuid,
    },
  })

  const { data: issueEvaluationStats } = useEnoughAnnotationsForIssue({
    project: project,
    commit: commit,
    issueId: issue.id,
    documentUuid: issue.documentUuid,
  })

  const hasEnoughAnnotations = useMemo(() => {
    return (
      issueEvaluationStats?.negativeAnnotationsOfThisIssue! >=
        MINIMUM_NEGATIVE_ANNOTATIONS_FOR_THIS_ISSUE &&
      issueEvaluationStats?.positiveAndNegativeAnnotationsOfOtherIssues! >=
        MINIMUM_POSITIVE_OR_OTHER_NEGATIVE_ANNOTATIONS_FOR_OTHER_ISSUES
    )
  }, [
    issueEvaluationStats?.negativeAnnotationsOfThisIssue,
    issueEvaluationStats?.positiveAndNegativeAnnotationsOfOtherIssues,
  ])

  const [openGenerateModal, setOpenGenerateModal] = useState(false)
  const [provider, setProvider] = useState<ProviderApiKey | undefined>()
  const [model, setModel] = useState<string | undefined | null>()

  const [endedEvaluation, setEndedEvaluation] = useState<{
    uuid: string | undefined
    hasError: boolean
  } | null>(null)

  const { data: activeEvaluations, isLoading: isLoadingActiveEvaluations } =
    useActiveEvaluations(
      {
        project: project,
      },
      {
        onEvaluationEnded: async (evaluation) => {
          if (evaluation.issueId !== issue.id) return
          const hasError = !!evaluation.error
          setEndedEvaluation({ uuid: evaluation.evaluationUuid, hasError })

          if (hasError) {
            toast({
              title: 'Evaluation generation failed',
              description: 'Please try again',
              variant: 'destructive',
            })
            // For errors, just wait the delay then clear and show button
            setTimeout(() => {
              setEndedEvaluation(null)
            }, ENDED_EVALUATION_DESCRIPTION_DELAY)
          } else {
            toast({
              title: 'Evaluation generated successfully',
              description: 'Let the magic begin!',
            })
            // For success, mutate evaluations to get the new, generated one and wait for it to appear
            mutateEvaluations().then(() => {
              setTimeout(() => {
                setEndedEvaluation(null)
              }, ENDED_EVALUATION_DESCRIPTION_DELAY)
            })
          }
        },
      },
    )

  const activeEvaluationForThisIssue = useMemo(() => {
    return activeEvaluations.find((e) => e.issueId === issue.id)
  }, [activeEvaluations, issue.id])

  const iconPropsByEvaluationStatus = useMemo<IconProps>(() => {
    const started = !!activeEvaluationForThisIssue?.startedAt
    const ended = !!activeEvaluationForThisIssue?.endedAt
    const error = !!activeEvaluationForThisIssue?.error

    if (!hasEnoughAnnotations) {
      return {
        name: 'alert',
        color: 'warningMutedForeground',
      }
    }

    if (error) {
      return {
        name: 'circleX',
        color: 'destructive',
      }
    }

    if (started && !ended) {
      return {
        name: 'loader',
        color: 'foregroundMuted',
        spin: true,
      }
    }
    if (ended) {
      return {
        name: 'checkClean',
        color: 'success',
      }
    }
    return {
      name: 'loader',
      color: 'primary',
      spin: true,
    }
  }, [activeEvaluationForThisIssue, hasEnoughAnnotations])

  const generationDescription = useTypeWriterValue(GENERATION_DESCRIPTIONS)

  const evaluationsThatCanBeAttachedToIssues = useMemo(
    () =>
      evaluations.filter(
        (e) =>
          !getEvaluationMetricSpecification(e).requiresExpectedOutput &&
          getEvaluationMetricSpecification(e).supportsLiveEvaluation,
      ),
    [evaluations],
  )

  const evaluationWithIssue = useMemo(
    () =>
      evaluationsThatCanBeAttachedToIssues.find((e) => e.issueId === issue.id),
    [evaluationsThatCanBeAttachedToIssues, issue.id],
  )

  const setIssueForNewEvaluation = useCallback(
    (newEvaluationUuid: string) => {
      // If a new evaluation is selected, attach it to the issue
      if (newEvaluationUuid) {
        updateEvaluation({
          evaluationUuid: newEvaluationUuid,
          issueId: issue.id,
        })
      }
      // If the issue already had an eval attached, remove it
      if (evaluationWithIssue) {
        updateEvaluation({
          evaluationUuid: evaluationWithIssue.uuid,
          issueId: null,
        })
      }
    },
    [evaluationWithIssue, issue.id, updateEvaluation],
  )

  const { data: document } = useDocumentVersion(issue.documentUuid)
  const { data: providers } = useProviderApiKeys()

  const openModalAndGetProviderFromDocument = useCallback(async () => {
    try {
      const metadata = await scan({
        prompt: document?.content ?? '',
      })
      const providerName = metadata.config?.['provider']
      const model = metadata.config?.['model'] as string | undefined
      const foundProvider = providers?.find((p) => p.name === providerName)
      setProvider(foundProvider)
      setModel(model)
    } catch (error) {
      setProvider(undefined)
      setModel(undefined)
    }
    setOpenGenerateModal(true)
  }, [
    document?.content,
    providers,
    setProvider,
    setModel,
    setOpenGenerateModal,
  ])

  const evaluationIsGenerating = useMemo(() => {
    return (
      activeEvaluationForThisIssue ||
      isLoadingActiveEvaluations ||
      (endedEvaluation && !endedEvaluation.hasError)
    )
  }, [
    activeEvaluationForThisIssue,
    endedEvaluation,
    isLoadingActiveEvaluations,
  ])

  const evaluationGenerationIsLoading = useMemo(() => {
    return isLoadingEvaluations || !issueEvaluationStats
  }, [isLoadingEvaluations, issueEvaluationStats])

  if (evaluationGenerationIsLoading) {
    return (
      <div className='grid grid-cols-2 gap-x-4 items-center'>
        <Text.H5 color='foregroundMuted'>Evaluation</Text.H5>
        <Skeleton className='w-full h-10' />
      </div>
    )
  }

  if (evaluationWithIssue) {
    return (
      <div className='grid grid-cols-2 gap-x-4 items-center'>
        <Text.H5 color='foregroundMuted'>Evaluation</Text.H5>
        <div className='flex flex-row items-center gap-2'>
          <Select
            badgeLabel
            align='end'
            searchable
            side='bottom'
            removable
            name='evaluation'
            options={evaluations.map((e) => ({
              label: e.name,
              value: e.uuid,
              icon: <Icon name={getEvaluationMetricSpecification(e).icon} />,
            }))}
            value={evaluationWithIssue?.uuid}
            disabled={isUpdatingEvaluation}
            loading={isUpdatingEvaluation}
            onChange={setIssueForNewEvaluation}
          />
          <Link
            href={
              ROUTES.projects
                .detail({ id: project.id })
                .commits.detail({ uuid: commit.uuid })
                .documents.detail({ uuid: issue.documentUuid })
                .evaluations.detail({ uuid: evaluationWithIssue.uuid }).root
            }
            target='_blank'
          >
            <Icon
              name='externalLink'
              color='foregroundMuted'
              className='hover:text-primary'
            />
          </Link>
        </div>
      </div>
    )
  }

  if (!hasEnoughAnnotations) {
    return (
      <div className='grid grid-cols-2 gap-x-4 items-center'>
        <Text.H5 color='foregroundMuted'>Evaluation</Text.H5>
        <div className='flex flex-row items-center gap-2'>
          <Icon {...iconPropsByEvaluationStatus} />
          <div className='flex flex-col'>
            <Text.H6M>Insufficient input</Text.H6M>
            <Text.H6 color='foregroundMuted'>
              {issueEvaluationStats?.negativeAnnotationsOfThisIssue! <
              MINIMUM_NEGATIVE_ANNOTATIONS_FOR_THIS_ISSUE
                ? `You need ${MINIMUM_NEGATIVE_ANNOTATIONS_FOR_THIS_ISSUE - issueEvaluationStats?.negativeAnnotationsOfThisIssue!} more negative annotations for this issue to generate an evaluation`
                : `You need ${MINIMUM_POSITIVE_OR_OTHER_NEGATIVE_ANNOTATIONS_FOR_OTHER_ISSUES - issueEvaluationStats?.positiveAndNegativeAnnotationsOfOtherIssues!} more positive annotations to generate an evaluation`}
            </Text.H6>
          </div>
        </div>
      </div>
    )
  }

  if (evaluationIsGenerating) {
    return (
      <div className='grid grid-cols-2 gap-x-4 items-center'>
        <Text.H5 color='foregroundMuted'>Evaluation</Text.H5>
        <div className='flex flex-row items-center gap-2'>
          <Icon {...iconPropsByEvaluationStatus} />
          <div className='flex flex-col'>
            <Text.H6M>
              {activeEvaluationForThisIssue?.error
                ? 'Failed to generate'
                : activeEvaluationForThisIssue?.endedAt
                  ? 'Finished successfully'
                  : activeEvaluationForThisIssue?.startedAt
                    ? 'Generating...'
                    : endedEvaluation
                      ? 'Finalizing...'
                      : 'Preparing...'}
            </Text.H6M>
            <Text.H6 color='foregroundMuted'>
              {activeEvaluationForThisIssue?.error
                ? 'Please try again'
                : endedEvaluation
                  ? 'Evaluation will appear shortly...'
                  : generationDescription}
            </Text.H6>
          </div>
        </div>
      </div>
    )
  }

  if (endedEvaluation?.hasError) {
    return (
      <div className='grid grid-cols-2 gap-x-4 items-center'>
        <Text.H5 color='foregroundMuted'>Evaluation</Text.H5>
        <div className='flex flex-row items-center gap-2'>
          <Icon name='circleX' color='destructive' />
          <div className='flex flex-col'>
            <Text.H6M>Failed to generate</Text.H6M>
            <Text.H6 color='foregroundMuted'>Please try again</Text.H6>
          </div>
        </div>
      </div>
    )
  }

  // If we have enough annotations, and the evaluation is not generating/generated yet, show the generate button
  return (
    <div className='grid grid-cols-2 gap-x-4 items-center'>
      <Text.H5 color='foregroundMuted'>Evaluation</Text.H5>
      <div>
        <Button
          variant='primaryMuted'
          iconProps={{
            name: 'wandSparkles',
            color: 'primary',
            placement: 'left',
          }}
          onClick={openModalAndGetProviderFromDocument}
        >
          Generate
        </Button>
        <EvaluationModal
          open={openGenerateModal}
          setOpen={setOpenGenerateModal}
          generateEvaluationFromIssue={() =>
            generateEvaluationFromIssue({
              issueId: issue.id,
              providerName: provider?.name!,
              model: model!,
            })
          }
          setProvider={setProvider}
          setModel={setModel}
          provider={provider}
          model={model}
        />
      </div>
    </div>
  )
}
