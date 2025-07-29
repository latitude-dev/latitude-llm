import { LatteInteraction } from '$/hooks/latte/types'
import { ChatInteraction } from './ChatInteraction'

export function LatteMessageList({
  interactions,
}: {
  interactions: LatteInteraction[]
}) {
  return (
    <div className='flex flex-col gap-8 px-8 pt-8 w-full'>
      {interactions.map((interaction, i) => (
        <ChatInteraction key={i} interaction={interaction} />
      ))}
    </div>
  )
}
