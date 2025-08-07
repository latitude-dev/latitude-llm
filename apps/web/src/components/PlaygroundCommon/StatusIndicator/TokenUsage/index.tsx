import type { LanguageModelUsage } from 'ai'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'

export function TokenUsage({ usage }: { usage?: LanguageModelUsage }) {
  return (
    <Tooltip
      side='top'
      align='center'
      sideOffset={5}
      delayDuration={250}
      trigger={
        <div className='cursor-pointer flex flex-row items-center gap-x-1'>
          <Text.H6M color='foregroundMuted'>
            {usage?.totalTokens || usage?.promptTokens || usage?.completionTokens || 0} tokens
          </Text.H6M>
          <Icon name='info' color='foregroundMuted' />
        </div>
      }
    >
      <div className='flex flex-col gap-2'>
        <span>{usage?.promptTokens || 0} prompt tokens</span>
        <span>{usage?.completionTokens || 0} completion tokens</span>
      </div>
    </Tooltip>
  )
}
