import { Select } from '../../../../../atoms/Select'
import {
  BaseNodeView,
  TypedNodeViewProps,
  withNodeViewProps,
} from '../../BaseNodeView'

export type Attr = { path: string }
type Props = TypedNodeViewProps<Attr>

function PromptSelectorNodeView({ node, updateAttributes }: Props) {
  return (
    <BaseNodeView errors={node.attrs.errors}>
      Id: {node.attrs.id}
      Path: {node.attrs.path}
      <Select
        name='prompt-reference'
        options={[
          { label: 'Prompt A', value: 'prompt-a' },
          { label: 'Prompt B', value: 'prompt-b' },
        ]}
        label='Select Prompt'
        onChange={(value) => updateAttributes({ path: value })}
      />
    </BaseNodeView>
  )
}

export default withNodeViewProps(PromptSelectorNodeView)
