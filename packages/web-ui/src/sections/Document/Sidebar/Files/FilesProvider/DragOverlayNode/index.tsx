import { createPortal } from 'react-dom'
import { Active, DragOverlay, useDndContext } from '@dnd-kit/core'
import { Icon, IconName } from '../../../../../../ds/atoms/Icons'
import { Text } from '../../../../../../ds/atoms/Text'
import { cn } from '../../../../../../lib/utils'

export type DraggableAndDroppableData = {
  nodeId: string
  name: string
  path: string
  isFile: boolean
  isRoot: boolean
}
function DraggableNodeVisual({ active }: { active: Active | null }) {
  if (!active) return null

  const currentData = active.data.current
  const currentRect = active.rect.current ? active.rect.current : null
  const data = currentData
    ? (currentData as DraggableAndDroppableData)
    : undefined
  const iconName: IconName = data?.isFile ? 'file' : 'folderClose'
  if (!data || !currentRect) return null

  return (
    <div
      className={cn(
        'relative flex flex-row items-center',
        'transition-transform duration-250 ease-in-out z-10 scale-105',
        'shadow-lg gap-x-1 my-0.5 px-2',
        'bg-primary min-w-7 rounded-md',
      )}
    >
      <Icon name='gridVertical' color='white' className='opacity-60' />
      <Icon name={iconName} color='white' />
      <div className='block cursor-pointer transition-opacity duration-250 ease-in-out'>
        <Text.H5 userSelect={false} align='center' color='white'>
          {data.name}
        </Text.H5>
      </div>
    </div>
  )
}

export function DraggableOverlayNode() {
  const { active } = useDndContext()

  return createPortal(
    <DragOverlay style={{ width: '250px', height: '100hv' }}>
      <DraggableNodeVisual active={active} />
    </DragOverlay>,
    document.body,
  )
}
