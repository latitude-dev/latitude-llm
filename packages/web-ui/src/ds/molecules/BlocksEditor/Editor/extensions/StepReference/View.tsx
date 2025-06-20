import { NodeViewContent } from '@tiptap/react'
import {
  BaseNodeView,
  TypedNodeViewProps,
  withNodeViewProps,
} from '../../BaseNodeView'
import { Text } from '../../../../../atoms/Text'

type Props = TypedNodeViewProps<{ as: string; isolated: boolean }>
export type Attr = Props['node']['attrs']

function View({ node }: Props) {
  // TODO: Handle update of these attributes
  // Also show an indication if the step has extra configuration like the `schema`, `temperature`, `model`...
  const { as: _as, isolated: _isolated } = node.attrs

  return (
    <BaseNodeView className='relative rounded-sm border-2 border-border mb-2'>
      <div className='flex justify-end'>
        <div className='px-1 py-0.5 bg-border border-l-2 border-b-2 border-border rounded-bl-sm rounded-tr-sm'>
          <Text.H6>step</Text.H6>
        </div>
      </div>
      <NodeViewContent className='space-y-2 px-2 pb-1' />
    </BaseNodeView>
  )
}

export default withNodeViewProps(View)
