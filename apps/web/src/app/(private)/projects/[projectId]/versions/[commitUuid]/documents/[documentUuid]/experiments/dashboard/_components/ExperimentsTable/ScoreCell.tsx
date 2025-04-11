'use client'

import { ExperimentDto } from '@latitude-data/core/browser'
import { Badge, BadgeProps } from '@latitude-data/web-ui/atoms/Badge'
import { Text } from '@latitude-data/web-ui/atoms/Text'

const scoreBadgeVariant = (score: number): BadgeProps['variant'] => {
  if (score >= 80) return 'successMuted'
  if (score >= 50) return 'warningMuted'
  return 'destructiveMuted'
}

export function ScoreCell({ experiment }: { experiment: ExperimentDto }) {
  const count =
    experiment.results.passed +
    experiment.results.failed +
    experiment.results.errors

  const avgScore =
    count > 0 ? (experiment.results.passed / count) * 100 : undefined

  if (avgScore === undefined) {
    return (
      <Text.H5 noWrap color='foregroundMuted'>
        N/A
      </Text.H5>
    )
  }

  const scoreText =
    avgScore % 1 === 0 ? avgScore.toFixed(0) : avgScore.toFixed(1)

  return <Badge variant={scoreBadgeVariant(avgScore)}>{scoreText}</Badge>
}
