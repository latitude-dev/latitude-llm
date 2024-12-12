import { Badge, BadgeProps } from '../../atoms'
import { ClickToCopy } from '../../molecules'

export function ClickToCopyUuid({
  uuid,
  tooltipContent,
  variant = 'muted',
}: {
  uuid: string
  variant?: BadgeProps['variant']
  tooltipContent?: string
}) {
  return (
    <ClickToCopy copyValue={uuid} tooltipContent={tooltipContent}>
      <Badge variant={variant}>{uuid.slice(-8)}</Badge>
    </ClickToCopy>
  )
}
