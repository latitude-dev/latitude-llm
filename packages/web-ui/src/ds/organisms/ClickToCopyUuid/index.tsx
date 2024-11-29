import { Badge, BadgeProps } from '../../atoms'
import { ClickToCopy } from '../../molecules'

export function ClickToCopyUuid({
  uuid,
  variant = 'muted',
}: {
  uuid: string
  variant?: BadgeProps['variant']
}) {
  return (
    <ClickToCopy copyValue={uuid}>
      <Badge variant={variant} className='ml-2'>
        {uuid.slice(-8)}
      </Badge>
    </ClickToCopy>
  )
}
