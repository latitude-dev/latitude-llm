import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { BackgroundColor, colors } from '@latitude-data/web-ui/tokens'
import { cn } from '@latitude-data/web-ui/utils'

export default function AgentCard({
  mainIcon,
  title,
  description,
  color,
  onClick,
  usedThirdPartyIcons,
}: {
  mainIcon: IconName
  title: string
  description: string
  color: BackgroundColor
  onClick: () => void
  usedThirdPartyIcons: IconName[]
}) {
  return (
    <div className='flex flex-col gap-y-14 justify-between h-full w-full'>
      <div className='flex flex-col gap-y-3'>
        <div
          className={cn(
            'flex flex-col items-center justify-center w-10 h-10 gap-3 rounded-full',
            colors.backgrounds[color],
          )}
        >
          <Icon
            name={mainIcon}
            size='large'
            color='white'
            className='justify-start '
          />
        </div>
        <div className='flex flex-col gap-y-1'>
          <Text.H3M>{title}</Text.H3M>
          <Text.H6 color='foregroundMuted'>{description}</Text.H6>
        </div>
      </div>
      <div className='flex flex-row mt-auto justify-between'>
        {usedThirdPartyIcons.map((icon) => (
          <div className='flex flex-row gap-x-2 bg-muted rounded-full p-1 border border-background'>
            <Icon name={icon} size='medium' key={icon} />
          </div>
        ))}
        <Button
          fancy
          variant='outline'
          iconProps={{ name: 'plus', placement: 'right' }}
          onClick={onClick}
        >
          Build agent
        </Button>
      </div>
    </div>
  )
}
