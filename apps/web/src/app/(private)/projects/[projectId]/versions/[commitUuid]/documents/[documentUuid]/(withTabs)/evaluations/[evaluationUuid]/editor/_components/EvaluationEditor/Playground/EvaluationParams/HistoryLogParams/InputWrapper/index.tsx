import { ReactNode } from 'react'
import { type LlmEvaluationPromptParameter } from '@latitude-data/constants'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { type LogInput } from '../../../../hooks/useEvaluationParameters/logInputParameters'

export function InputWrapper({
  children,
  param,
  input,
}: {
  children: ReactNode
  param: LlmEvaluationPromptParameter
  input: LogInput | undefined
}) {
  if (!input) return null

  const includedInPrompt = input?.metadata?.includedInPrompt ?? true
  return (
    <div className='grid col-span-2 grid-cols-subgrid gap-3 w-full items-start'>
      <div className='flex flex-row items-center gap-x-2 min-h-8'>
        <Badge variant={includedInPrompt ? 'accent' : 'muted'}>
          &#123;&#123;{param}&#125;&#125;
        </Badge>
        {!includedInPrompt && (
          <Tooltip trigger={<Icon name='info' />}>
            This variable is not included in the current prompt
          </Tooltip>
        )}
      </div>
      <div className='flex flex-grow w-full min-w-0'>{children}</div>
    </div>
  )
}
