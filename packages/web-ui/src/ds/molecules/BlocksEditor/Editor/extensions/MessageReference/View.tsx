import { NodeViewContent, NodeViewWrapper } from '@tiptap/react'
import {
  BaseNodeView,
  TypedNodeViewProps,
  withNodeViewProps,
} from '../../BaseNodeView'
import { Text } from '../../../../../atoms/Text'
import { MessageBlockType } from '@latitude-data/constants/simpleBlocks'

type Props = TypedNodeViewProps<{ role: MessageBlockType }>
export type Attr = Props['node']['attrs']

function View({ node }: Props) {
  return (
    <BaseNodeView className='relative rounded-sm border border-border mb-2'>
      <div className='flex justify-end'>
        <div className='px-1 py-0.5 bg-muted border-l border-b border-border rounded-bl-sm rounded-tr-sm'>
          <Text.H6>{node.attrs.role}</Text.H6>
        </div>
      </div>
      <NodeViewContent className='space-y-2 px-2 pb-3' />
    </BaseNodeView>
  )
}

export default withNodeViewProps(View)
