import { NodeViewContent } from '@tiptap/react'
import { MessageBlockType } from '@latitude-data/constants/simpleBlocks'
import {
  BaseNodeView,
  TypedNodeViewProps,
  withNodeViewProps,
} from '../../BaseNodeView'
import { Text } from '../../../../../atoms/Text'
import { cn } from '../../../../../../lib/utils'

type RoleColor = { bar: string }
const COLOR_BY_ROLE: Record<MessageBlockType, RoleColor> = {
  system: { bar: 'bg-blue-400' },
  assistant: { bar: 'bg-emerald-500' },
  developer: { bar: 'bg-purple-500' },
  user: { bar: 'bg-gray-400' },
}

type Props = TypedNodeViewProps<{ role: MessageBlockType }>
export type Attr = Props['node']['attrs']

function View({ node }: Props) {
  return (
    <BaseNodeView className='flex flex-row gap-x-2'>
      <div
        className={cn('w-1', COLOR_BY_ROLE[node.attrs.role].bar)}
      />
      <div className='flex-1 flex flex-col gap-y-2'>
        <Text.H5M uppercase>{node.attrs.role}</Text.H5M>
        <NodeViewContent className='base-node-view' />
      </div>
    </BaseNodeView>
  )
}

export default withNodeViewProps(View)
