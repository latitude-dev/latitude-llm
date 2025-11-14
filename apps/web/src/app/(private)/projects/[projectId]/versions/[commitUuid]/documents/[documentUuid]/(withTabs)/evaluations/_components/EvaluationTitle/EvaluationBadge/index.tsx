import {
  getEvaluationMetricSpecification,
  getEvaluationTypeSpecification,
} from '$/components/evaluations'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { type EvaluationV2 } from '@latitude-data/core/constants'
import { TextColor } from '@latitude-data/web-ui/tokens'

export function EvaluationBadge({
  evaluation,
  color = 'foregroundMuted',
}: {
  evaluation: EvaluationV2
  color?: TextColor
}) {
  const typeSpec = getEvaluationTypeSpecification(evaluation)
  const metricSpec = getEvaluationMetricSpecification(evaluation)
  return (
    <div className='w-fit flex flex-row items-center'>
      <Tooltip
        trigger={
          <div className='py-0.5 flex flex-row items-center min-w-0 gap-x-1'>
            <Icon name={typeSpec.icon} color={color} className='flex-none' />
            <Text.H6 noWrap ellipsis color='foreground'>
              {typeSpec.name}
            </Text.H6>
          </div>
        }
      >
        {typeSpec.description}
      </Tooltip>
      <Tooltip
        trigger={
          <div className='py-0.5 px-2 flex flex-row items-center min-w-0 gap-x-1'>
            <Icon name={metricSpec.icon} color={color} />
            <Text.H6 noWrap ellipsis color={color}>
              {metricSpec.name}
            </Text.H6>
          </div>
        }
      >
        {metricSpec.description}
      </Tooltip>
    </div>
  )
}
