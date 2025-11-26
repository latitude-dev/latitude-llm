import { ReactNode, useMemo } from 'react'
import Link from 'next/link'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useAnnotationsProgress } from '$/stores/issues/annotationsProgress'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ROUTES } from '$/services/routes'
import {
  OPTIMAL_MONTLY_ANNOTATIONS,
  MINIMUM_MONTLY_ANNOTATIONS,
} from '@latitude-data/constants/issues'

export function SimpleLink({ href }: { href: string }) {
  return (
    <Link href={href}>
      <Text.H5 underline color='foregroundMuted'>
        issues section
      </Text.H5>
    </Link>
  )
}

type Data = {
  issuesDashboardLink: string
  data: {
    currentAnnotations: number
    optimalAnnotations: number
  }
}

type ProgressBase = Data & {
  message: ReactNode
}

type ProgressNotStarted = ProgressBase & {
  status: 'not_started'
  tooltipMinimal: string
}
type ProgressInProgress = ProgressBase & {
  status: 'in_progress'
  tooltipMinimal: string
}
type ProgessAccomplished = ProgressBase & {
  status: 'accomplished'
  optimalAchieved: boolean
  tooltipMinimal: string
  header: string
}

type ProgessLoading = {
  status: 'loading'
}

type AnnotationProgress =
  | ProgressNotStarted
  | ProgressInProgress
  | ProgessAccomplished
  | ProgessLoading

function buildNotStarted(progress: Data): ProgressNotStarted {
  return {
    ...progress,
    status: 'not_started',
    tooltipMinimal: "No annotations yet. Let's get started!",
    message: (
      <Text.H5 color='foregroundMuted'>
        Annotate <strong>at least {MINIMUM_MONTLY_ANNOTATIONS}</strong> runs
        with notes to unlock the{' '}
        <SimpleLink href={progress.issuesDashboardLink} />.
      </Text.H5>
    ),
  }
}

function buildInProgress(progress: Data): ProgressInProgress {
  const remaining = Math.max(
    0,
    MINIMUM_MONTLY_ANNOTATIONS - progress.data.currentAnnotations,
  )
  const current = progress.data.currentAnnotations
  return {
    ...progress,
    status: 'in_progress',
    tooltipMinimal:
      current > MINIMUM_MONTLY_ANNOTATIONS
        ? `You've annotated ${current} runs. Enough to unlock the issues overview!`
        : `You've annotated ${current} runs. Annotate ${remaining} more to unlock the issues overview!`,
    message: (
      <Text.H5 color='foregroundMuted'>
        Annotate <strong>{remaining} more</strong> runs with notes to unlock the{' '}
        <SimpleLink href={progress.issuesDashboardLink} />.
      </Text.H5>
    ),
  }
}

function buildAccomplished(progress: Data): ProgessAccomplished {
  const optimalAchieved =
    progress.data.currentAnnotations >= progress.data.optimalAnnotations
  return {
    ...progress,
    status: 'accomplished',
    header: 'Issues overview is now available.',
    tooltipMinimal: 'You reached the annotation minimal, keep going! 💪',
    optimalAchieved:
      progress.data.currentAnnotations >= progress.data.optimalAnnotations,
    message: (
      <Text.H5 color='foregroundMuted'>
        {optimalAchieved
          ? `${progress.data.currentAnnotations} annotations done! You've reached the optimal number of annotations for this month.`
          : 'Keep annotating to discover more issues.'}
      </Text.H5>
    ),
  }
}

/**
 * Hook to fetch annotation progress data
 */
export function useAnnotationProgress({
  isReady,
}: {
  isReady: boolean
}): AnnotationProgress {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { isLoading, data } = useAnnotationsProgress({
    projectId: project.id,
    commitUuid: commit.uuid,
  })
  const issuesDashboardLink = ROUTES.projects
    .detail({ id: project.id })
    .commits.detail({ uuid: commit.uuid }).issues.root

  return useMemo(() => {
    if (!isReady || isLoading) return { status: 'loading' }
    const progressData: Data = {
      issuesDashboardLink,
      data: {
        currentAnnotations: data.currentAnnotations,
        optimalAnnotations: Math.max(
          MINIMUM_MONTLY_ANNOTATIONS,
          Math.min(data.totalRuns, OPTIMAL_MONTLY_ANNOTATIONS),
        ),
      },
    }
    if (data.currentAnnotations === 0) {
      return buildNotStarted(progressData)
    } else if (data.currentAnnotations < MINIMUM_MONTLY_ANNOTATIONS) {
      return buildInProgress(progressData)
    } else {
      return buildAccomplished(progressData)
    }
  }, [data, issuesDashboardLink, isLoading, isReady])
}
