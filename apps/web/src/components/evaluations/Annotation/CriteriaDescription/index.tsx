import { ReactNode } from 'react'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'

type CriteriaFooterProps = {
  criteria?: string
  reverseScale?: boolean
}
function CriteriaFooter({ criteria, reverseScale }: CriteriaFooterProps) {
  if (!criteria && !reverseScale) return null

  return (
    <div className='pt-3 border-t border-dashed border-background flex flex-col gap-y-2'>
      <Text.H6 color='primaryForeground'>{criteria}</Text.H6>
      {reverseScale ? (
        <div className='flex items-center gap-x-1'>
          <Icon name='arrowDown' color='latteBackground' />
          <Text.H6 color='latteBackground'>A lower score is better</Text.H6>
        </div>
      ) : null}
    </div>
  )
}

export function CriteriaDescription({
  children,
  reverseScale,
  criteria,
}: CriteriaFooterProps & {
  children: ReactNode
}) {
  return (
    <div className='flex gap-y-2 flex-col'>
      {children}
      <CriteriaFooter criteria={criteria} reverseScale={reverseScale} />
    </div>
  )
}
