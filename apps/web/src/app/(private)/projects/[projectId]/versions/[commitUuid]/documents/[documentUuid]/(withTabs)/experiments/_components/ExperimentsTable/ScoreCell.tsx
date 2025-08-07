'use client'

import type { ExperimentDto } from '@latitude-data/core/browser'
import { Badge, type BadgeProps } from '@latitude-data/web-ui/atoms/Badge'
import { Text } from '@latitude-data/web-ui/atoms/Text'

const scoreBadgeVariant = (score: number): BadgeProps['variant'] => {
  if (score >= 80) return 'successMuted'
  if (score >= 50) return 'warningMuted'
  return 'destructiveMuted'
}

export function ScoreCell({ experiment }: { experiment: ExperimentDto }) {
  const count = experiment.results.passed + experiment.results.failed + experiment.results.errors // Errors are counted as 0 in the average score

  const avgScore = count > 0 ? experiment.results.totalScore / count : undefined

  if (avgScore === undefined) {
    return (
      <Text.H5 noWrap color='foregroundMuted'>
        N/A
      </Text.H5>
    )
  }

  const scoreText = avgScore % 1 < 0.01 ? avgScore.toFixed(0) : avgScore.toFixed(2)

  return <Badge variant={scoreBadgeVariant(avgScore)}>{scoreText}</Badge>
}
