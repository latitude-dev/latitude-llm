import { cn } from '@latitude-data/web-ui/utils'
import { type EvaluationV2 } from '@latitude-data/core/browser'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import {
  getEvaluationMetricSpecification,
  getEvaluationTypeSpecification,
} from '$/components/evaluations'

export function EvaluationBadge({ evaluation }: { evaluation: EvaluationV2 }) {
  const typeSpec = getEvaluationTypeSpecification(evaluation)
  const metricSpec = getEvaluationMetricSpecification(evaluation)
  return (
    <div className={cn('w-fit flex flex-row items-center')}>
      <div className='flex items-cente'>
        <Tooltip
          trigger={
            <div className='py-0.5 flex flex-row items-center min-w-0 gap-x-1'>
              <Icon
                name={typeSpec.icon}
                color='foregroundMuted'
                className='flex-none'
              />
              <Text.H6 noWrap ellipsis color='foreground'>
                {typeSpec.name}
              </Text.H6>
            </div>
          }
        >
          {typeSpec.description}
        </Tooltip>
      </div>
      <Tooltip
        trigger={
          <div className='py-0.5 px-2 flex flex-row items-center min-w-0 gap-x-1'>
            <Icon name={metricSpec.icon} color='foregroundMuted' />
            <Text.H6 noWrap ellipsis color='foregroundMuted'>
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
