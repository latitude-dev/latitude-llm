import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { colors } from '@latitude-data/web-ui/tokens'
import { cn } from '@latitude-data/web-ui/utils'
import Image from 'next/image'
import { AgentCardProps } from '../SelectAgents'

export default function AgentCard({
  agent,
  onClick,
}: {
  agent: AgentCardProps
  onClick: () => void
}) {
  const { mainIcon, title, description, color, usedThirdPartyIconsSrc } = agent

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
        <div className='flex flex-row items-center'>
          {usedThirdPartyIconsSrc.map((icon, index) => (
            <div
              key={icon}
              className={cn(
                'flex flex-row bg-muted rounded-full p-1 w-9 h-9 border-2 border-white justify-center items-center',
                index > 0 && '-ml-3',
              )}
            >
              <Image
                src={icon}
                width={16}
                height={16}
                className='w-5 h-5'
                key={icon}
                alt={icon}
                unoptimized
              />
            </div>
          ))}
        </div>
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
