import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Card } from '@latitude-data/web-ui/atoms/Card'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'

type InfoItem = {
  label: string
  value: string | number
  monospace?: boolean
  icon?: IconName
  badge?: boolean
}

type Props = {
  items: InfoItem[]
  title?: string
}

export function BasicInfoList({ items, title }: Props) {
  return (
    <Card className='p-6'>
      {title && (
        <div className='mb-6 flex items-center space-x-3'>
          <Icon name='info' size='medium' color='primary' />
          <Text.H3>{title}</Text.H3>
        </div>
      )}
      <div className='grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3'>
        {items.map((item, index) => (
          <div
            key={index}
            className='flex items-center space-x-3 p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors'
          >
            {item.icon && (
              <div className='p-2 bg-background rounded-md shadow-sm'>
                <Icon name={item.icon} size='normal' color='primary' />
              </div>
            )}
            <div className='flex-1 min-w-0'>
              <Text.H5 color='foregroundMuted'>{item.label}</Text.H5>
              <div className='flex items-center space-x-2 mt-1'>
                <Text.H4 weight='medium' monospace={item.monospace}>
                  {item.value}
                </Text.H4>
                {item.badge && (
                  <Badge variant='secondary' size='small'>
                    Active
                  </Badge>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
