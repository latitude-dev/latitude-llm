import { Badge } from '@latitude-data/web-ui'

import { TooltipInfo } from './TooltipInfo'

export const InputSection = ({
  title,
  content,
  tooltip,
  type = 'text',
}: {
  title: string
  content: string
  tooltip: string
  type?: string
}) => (
  <div className='flex flex-col gap-2'>
    <div className='flex flex-row gap-2 items-center'>
      <Badge variant='accent'>{title}</Badge>
      <TooltipInfo text={tooltip} />
    </div>
    <div>
      <input
        type={type}
        className='p-2 rounded-lg border bg-secondary resize-y text-xs'
        value={content}
        disabled
        readOnly
      />
    </div>
  </div>
)
