'use client'

import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import React, { useCallback, useMemo } from 'react'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { getEvaluationMetricSpecification } from '$/components/evaluations'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Issue } from '@latitude-data/core/schema/models/types/Issue'

export function IssueEvaluation({ issue }: { issue: Issue }) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()

  const {
    data: evaluations,
    isLoading: isLoadingEvaluations,
    updateEvaluation,
    isUpdatingEvaluation,
    //    isGeneratingEvaluationFromIssue,
    //    generateEvaluationFromIssue,
  } = useEvaluationsV2({
    project: project,
    commit: commit,
    document: {
      commitId: commit.id,
      documentUuid: issue.documentUuid,
    },
  })

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
      // If the issue already had an eval attached, remove it
      if (evaluationWithIssue) {
        updateEvaluation({
          evaluationUuid: evaluationWithIssue.uuid,
          issueId: null,
        })
      }
      // If a new evaluation is selected, attach it to the issue
      if (newEvaluationUuid) {
        updateEvaluation({
          evaluationUuid: newEvaluationUuid,
          issueId: issue.id,
        })
      }
    },
    [evaluationWithIssue, issue.id, updateEvaluation],
  )

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
            // footerAction={{
            //   label: 'Generate new evaluation',
            //   icon: 'wandSparkles',
            //   onClick: () => undefined,
            // }} // TODO(evaluation-generator): Remove this once we have a way to generate evaluations from issues
          />
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
          disabled={true} // TODO(evaluation-generator): Remove this once we have a way to generate evaluations from issues
          onClick={() => {
            //   e.stopPropagation()
            //   generateEvaluationFromIssue({ issueId: issue.id })
          }} // TODO(evaluation-generator): Uncomment this once we have a way to generate evaluations from issues
          // disabled: isGeneratingEvaluationFromIssue,
          // isLoading: isGeneratingEvaluationFromIssue,
        >
          Generate
        </Button>
      </div>
    </div>
  )
}
