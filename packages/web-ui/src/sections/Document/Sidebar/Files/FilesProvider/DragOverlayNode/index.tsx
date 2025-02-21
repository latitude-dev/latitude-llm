import { createPortal } from 'react-dom'
import {
  Active,
  DragOverlay,
  DropAnimation,
  useDndContext,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Icon, IconName, Text } from '../../../../../../ds/atoms'
import { cn } from '../../../../../../lib/utils'

const dropAnimationConfig: DropAnimation = {
  keyframes({ transform }) {
    return [
      { transform: CSS.Transform.toString(transform.initial) },
      {
        transform: CSS.Transform.toString({
          ...transform.final,
          scaleX: 0.94,
          scaleY: 0.94,
        }),
      },
    ]
  },
  sideEffects({ active, dragOverlay }) {
    active.node.style.opacity = '0'

    const button = dragOverlay.node.querySelector('button')

    if (button) {
      button.animate(
        [
          {
            boxShadow:
              '-1px 0 15px 0 rgba(34, 33, 81, 0.01), 0px 15px 15px 0 rgba(34, 33, 81, 0.25)',
          },
          {
            boxShadow:
              '-1px 0 15px 0 rgba(34, 33, 81, 0), 0px 15px 15px 0 rgba(34, 33, 81, 0)',
          },
        ],
        {
          duration: 250,
          easing: 'ease',
          fill: 'forwards',
        },
      )
    }

    return () => {
      active.node.style.opacity = ''
    }
  },
}

type DraggableNodeData = {
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
  const data = currentData ? (currentData as DraggableNodeData) : undefined
  const iconName: IconName = data?.isFile ? 'file' : 'folderClose'
  if (!data || !currentRect) return null

  console.log('CURRENT_RECT', currentRect)

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

export function DraggableOverlayNode({
  dropAnimation = dropAnimationConfig,
}: {
  dropAnimation?: DropAnimation | null
}) {
  const { active } = useDndContext()

  return createPortal(
    <DragOverlay
      dropAnimation={dropAnimation}
      style={{ width: '250px', height: '100hv' }}
    >
      <DraggableNodeVisual active={active} />
    </DragOverlay>,
    document.body,
  )
}
