'use client'

import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { getEvaluationMetricSpecification } from '$/components/evaluations'
import { useCompositeTargetToast } from '$/hooks/useCompositeTargetToast'
import { ROUTES } from '$/services/routes'
import { useActiveEvaluations } from '$/stores/activeEvaluations'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import { useEnoughAnnotationsForIssue } from '$/stores/issues/enoughAnnotationsForIssue'
import {
  ActiveEvaluation,
  EvaluationType,
  EvaluationV2,
} from '@latitude-data/constants/evaluations'
import {
  MINIMUM_NEGATIVE_ANNOTATIONS_FOR_THIS_ISSUE,
  MINIMUM_POSITIVE_OR_OTHER_NEGATIVE_ANNOTATIONS_FOR_OTHER_ISSUES,
} from '@latitude-data/constants/issues'
import { Issue } from '@latitude-data/core/schema/models/types/Issue'
import { toast } from 'node_modules/@latitude-data/web-ui/src/ds/atoms/Toast/useToast'
import { useCallback, useMemo, useState } from 'react'
import { EvaluationGenerationError } from './_components/EvaluationGenerationError'
import { EvaluationWithIssue } from './_components/EvaluationWithIssue'
import { GenerateEvaluationButton } from './_components/GenerateEvaluationButton'
import { GeneratingEvaluation } from './_components/GeneratingEvaluation'
import { InsufficientAnnotations } from './_components/InsufficientAnnotations'
import { LoadingEvaluationGeneration } from './_components/LoadingEvaluationGeneration'

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
  const targetToast = useCompositeTargetToast({ project, commit })

  const { data: issueEvaluationStats } = useEnoughAnnotationsForIssue({
    project: project,
    commit: commit,
    issueId: issue.id,
  })

  const hasEnoughAnnotations = useMemo(() => {
    return (
      issueEvaluationStats?.negativeAnnotationsOfThisIssue! >=
        MINIMUM_NEGATIVE_ANNOTATIONS_FOR_THIS_ISSUE &&
      issueEvaluationStats?.passedEvaluationResults! >=
        MINIMUM_POSITIVE_OR_OTHER_NEGATIVE_ANNOTATIONS_FOR_OTHER_ISSUES
    )
  }, [
    issueEvaluationStats?.negativeAnnotationsOfThisIssue,
    issueEvaluationStats?.passedEvaluationResults,
  ])

  const [endedEvaluation, setEndedEvaluation] = useState<{
    uuid: string | undefined
    error: Error | undefined
  } | null>(null)

  const onEvaluationEnded = useCallback(
    async (evaluation: ActiveEvaluation) => {
      if (evaluation.issueId !== issue.id) return
      setEndedEvaluation({
        uuid: evaluation.evaluationUuid,
        error: evaluation.error,
      })

      if (evaluation.error) {
        toast({
          title: 'Evaluation generation failed',
          description: 'Please try again',
          variant: 'destructive',
        })
        // For errors, just wait the delay then clear and show button
        setTimeout(() => {
          setEndedEvaluation(null)
        }, 10000) // 10 seconds
      } else {
        const target = evaluations.find(
          (e) => e.uuid === evaluation.targetUuid,
        ) as EvaluationV2<EvaluationType.Composite> | undefined
        if (target) {
          targetToast({
            evaluation: { name: evaluation.evaluationName! },
            target: { ...target, action: evaluation.targetAction! },
          })
        }
        // Note: this is an edge case that only happens here because we cannot
        // access the performance evaluation that has been just created (race)
        else if (evaluation.targetAction === 'create') {
          toast({
            title: `A new Performance score has been created`,
            description: `from ${evaluation.evaluationName!} evaluation`,
            href:
              ROUTES.projects
                .detail({ id: project.id })
                .commits.detail({ uuid: commit.uuid })
                .documents.detail({ uuid: issue.documentUuid })
                .evaluations.detail({ uuid: evaluation.targetUuid! }).root +
              '?action=editSettings',
          })
        } else {
          toast({
            title: `Evaluation ${evaluation.evaluationName!} generated successfully`,
            description: 'Let the magic begin!',
          })
        }

        // For success, mutate evaluations to get the new, generated one and wait for it to appear
        mutateEvaluations().then(() => {
          setTimeout(() => {
            setEndedEvaluation(null)
          }, 3000) // 3 seconds
        })
      }
    },
    [
      evaluations,
      project,
      commit,
      issue,
      setEndedEvaluation,
      mutateEvaluations,
      targetToast,
    ],
  )

  const { data: activeEvaluations, isLoading: isLoadingActiveEvaluations } =
    useActiveEvaluations(
      {
        project: project,
      },
      {
        onEvaluationEnded: onEvaluationEnded,
      },
    )

  const activeEvaluationForThisIssue = useMemo(() => {
    return activeEvaluations.find((e) => e.issueId === issue.id)
  }, [activeEvaluations, issue.id])

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
          documentUuid: issue.documentUuid,
          evaluationUuid: newEvaluationUuid,
          issueId: issue.id,
        })
      }
      // If the issue already had an eval attached, remove it
      if (evaluationWithIssue) {
        updateEvaluation({
          documentUuid: issue.documentUuid,
          evaluationUuid: evaluationWithIssue.uuid,
          issueId: null,
        })
      }
    },
    [evaluationWithIssue, issue.id, issue.documentUuid, updateEvaluation],
  )

  const evaluationIsGenerating = useMemo(() => {
    return (
      activeEvaluationForThisIssue ||
      isLoadingActiveEvaluations ||
      (endedEvaluation && !endedEvaluation.error)
    )
  }, [
    activeEvaluationForThisIssue,
    endedEvaluation,
    isLoadingActiveEvaluations,
  ])

  const evaluationGenerationIsLoading =
    isLoadingEvaluations || !issueEvaluationStats

  const evaluationWithIssueIsReady = useMemo(() => {
    return (
      evaluationWithIssue &&
      evaluationWithIssue.alignmentMetric !== null &&
      evaluationWithIssue.alignmentMetric !== undefined &&
      evaluationWithIssue.alignmentMetric !== 0
    )
  }, [evaluationWithIssue])

  if (evaluationGenerationIsLoading) {
    return <LoadingEvaluationGeneration />
  }

  if (evaluationWithIssueIsReady) {
    return (
      <EvaluationWithIssue
        evaluationWithIssue={evaluationWithIssue!}
        evaluations={evaluations}
        issue={issue}
        isUpdatingEvaluation={isUpdatingEvaluation}
        setIssueForNewEvaluation={setIssueForNewEvaluation}
      />
    )
  }

  if (!hasEnoughAnnotations) {
    return (
      <InsufficientAnnotations
        negativeAnnotationsOfThisIssue={
          issueEvaluationStats?.negativeAnnotationsOfThisIssue ?? 0
        }
        positiveAndNegativeAnnotationsOfOtherIssues={
          issueEvaluationStats?.passedEvaluationResults ?? 0
        }
      />
    )
  }

  if (endedEvaluation?.error) {
    return <EvaluationGenerationError error={endedEvaluation?.error} />
  }

  if (evaluationIsGenerating) {
    return (
      <GeneratingEvaluation
        activeEvaluation={activeEvaluationForThisIssue}
        endedEvaluation={endedEvaluation}
      />
    )
  }

  // If we have enough annotations, and the evaluation is not generating/generated yet, show the generate button
  return (
    <GenerateEvaluationButton
      generateEvaluationFromIssue={(providerName, model) =>
        generateEvaluationFromIssue({
          documentUuid: issue.documentUuid,
          issueId: issue.id,
          providerName,
          model,
        })
      }
      issueDocumentUuid={issue.documentUuid}
      commitUuid={commit.uuid}
    />
  )
}
