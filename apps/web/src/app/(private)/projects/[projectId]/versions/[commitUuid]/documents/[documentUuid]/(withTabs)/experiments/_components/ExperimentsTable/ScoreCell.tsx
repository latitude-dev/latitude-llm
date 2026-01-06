'use client'

import { ExperimentDto } from '@latitude-data/core/schema/models/types/Experiment'
import { Badge, BadgeProps } from '@latitude-data/web-ui/atoms/Badge'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'

const scoreBadgeVariant = (score: number): BadgeProps['variant'] => {
  if (score >= 80) return 'successMuted'
  if (score >= 50) return 'warningMuted'
  return 'destructiveMuted'
}

export function ScoreCell({
  experiment,
  icon,
  hideWhenEmpty = false,
}: {
  experiment: ExperimentDto
  icon?: IconName
  hideWhenEmpty?: boolean
}) {
  const count =
    experiment.results.passed +
    experiment.results.failed +
    experiment.results.errors // Errors are counted as 0 in the average score

  const avgScore = count > 0 ? experiment.results.totalScore / count : undefined

  if (avgScore === undefined) {
    if (hideWhenEmpty) {
      return null
    }

    return (
      <Text.H5 noWrap color='foregroundMuted'>
        N/A
      </Text.H5>
    )
  }

  const scoreText =
    avgScore % 1 < 0.01 ? avgScore.toFixed(0) : avgScore.toFixed(2)

  if (icon) {
    return (
      <Badge
        variant={scoreBadgeVariant(avgScore)}
        iconProps={{ name: icon, placement: 'end' }}
      >
        {scoreText}
      </Badge>
    )
  }

  return <Badge variant={scoreBadgeVariant(avgScore)}>{scoreText}</Badge>
}
