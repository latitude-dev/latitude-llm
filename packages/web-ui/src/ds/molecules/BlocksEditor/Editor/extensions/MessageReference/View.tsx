import { NodeViewContent } from '@tiptap/react'
import { MessageBlockType } from '@latitude-data/constants/simpleBlocks'
import {
  BaseNodeView,
  TypedNodeViewProps,
  withNodeViewProps,
} from '../../BaseNodeView'
import { Badge } from '../../../../../atoms/Badge'
import { roleToString, roleVariant } from '../../../../ChatWrapper'

type Props = TypedNodeViewProps<{ role: MessageBlockType }>
export type Attr = Props['node']['attrs']

function View({ node }: Props) {
  const role = node.attrs.role
  const label = roleToString(role)
  const variant = roleVariant(role)
  return (
    <BaseNodeView className='flex flex-col gap-1 w-full items-start'>
      <div>
        <Badge variant={variant}>{label}</Badge>
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
