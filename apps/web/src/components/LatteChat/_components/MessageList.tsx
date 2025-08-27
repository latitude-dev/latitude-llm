import { LatteInteraction } from '$/hooks/latte/types'
import { ChatInteraction } from './ChatInteraction'

export function LatteMessageList({
  interactions,
  isBrewing,
  showThinking,
}: {
  interactions: LatteInteraction[]
  isBrewing: boolean
  showThinking: boolean
}) {
  const lastInteractionIndex = interactions.length - 1
  return (
    <div className='flex flex-col gap-8 px-8 pt-8 w-full'>
      {interactions.map((interaction, i) => (
        <ChatInteraction
          key={i}
          interaction={interaction}
          isBrewing={isBrewing}
          showThinking={showThinking}
          lastInteraction={i === lastInteractionIndex}
        />
      ))}
    </div>
  )
}
