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

const GENERATION_DESCRIPTIONS = [
  'Thinking of a good configuration...',
  'Validating its effectiveness...',
  'Trying a different approach...',
  'Validating the new approach...',
  'Found it! Creating the evaluation...',
]

const ENDED_EVALUATION_DESCRIPTION_DELAY = 3000

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

  const [endedEvaluation, setEndedEvaluation] = useState<{
    uuid: string
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
          setEndedEvaluation({ uuid: evaluation.uuid, hasError })

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
  }, [activeEvaluationForThisIssue])

  const [openGenerateModal, setOpenGenerateModal] = useState(false)
  const [provider, setProvider] = useState<ProviderApiKey | undefined>()
  const [model, setModel] = useState<string | undefined | null>()

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

  if (isLoadingEvaluations) {
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
        <div>
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
        </div>
      </div>
    )
  }

  if (
    activeEvaluationForThisIssue ||
    isLoadingActiveEvaluations ||
    (endedEvaluation && !endedEvaluation.hasError)
  ) {
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
