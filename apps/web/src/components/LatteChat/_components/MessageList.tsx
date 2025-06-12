import { LatteInteraction } from '$/hooks/latte/types'
import { ChatInteraction } from './ChatInteraction'

export function LatteMessageList({
  interactions,
}: {
  interactions: LatteInteraction[]
}) {
  return (
    <div className='flex flex-col gap-8 w-full max-w-[600px]'>
      {interactions.map((interaction, i) => {
        return <ChatInteraction key={i} interaction={interaction} />
      })}
    </div>
  )
}
