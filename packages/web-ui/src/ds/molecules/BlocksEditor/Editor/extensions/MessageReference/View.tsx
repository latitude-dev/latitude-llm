import { NodeViewContent } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { MessageBlockType } from '@latitude-data/constants/simpleBlocks'
import {
  BaseNodeView,
  TypedNodeViewProps,
  withNodeViewProps,
} from '../../BaseNodeView'
import { Badge } from '../../../../../atoms/Badge'
import { roleToString, roleVariant } from '../../../../ChatWrapper'
import { Icon } from '../../../../../atoms/Icons'
import { DragEventHandler, useCallback } from 'react'

type Props = TypedNodeViewProps<{ role: MessageBlockType }>
export type Attr = Props['node']['attrs']

function View({ node, editor, getPos }: Props) {
  const role = node.attrs.role
  const label = roleToString(role)
  const variant = roleVariant(role)
  const onDragStart: DragEventHandler<HTMLDivElement> = useCallback(
    (event) => {
      console.log("ON_DRAG_START", event)
      const pos = getPos()
      if (pos === undefined) return

      editor.view.dispatch(
        editor.state.tr.setSelection(
          NodeSelection.create(editor.state.doc, pos),
        ),
      )
      event.dataTransfer.setData('application/x-prosemirror-node', '')
    },
    [editor, getPos],
  )
  return (
    <BaseNodeView draggable className='flex flex-col gap-1 w-full items-start editor-block'>
      <div className='flex flex-co gap-x-2'>
        <Badge variant={variant}>{label}</Badge>
        <div
          className='custom-drag-handle relative'
          onDragStart={onDragStart}
        >
          <span
            onDragStart={onDragStart}
            className='absolute inset-y-[-8px] inset-x-[-8px] bg-red-400/65'
          />
          <Icon name='gridVertical' color='foregroundMuted' />
        </div>
      </div>
      <div className='flex w-full flex-row items-stretch gap-4 pl-4'>
        <div className='flex-shrink-0 bg-muted w-1 rounded-lg cursor-pointer transition-colors' />
        <div className='flex flex-grow flex-col gap-1 overflow-x-auto'>
          <NodeViewContent className='base-node-view' />
        </div>
      </div>
    </BaseNodeView>
  )
}

export default withNodeViewProps(View)
