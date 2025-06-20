import {
  BaseNodeView,
  TypedNodeViewProps,
  withNodeViewProps,
} from '../../BaseNodeView'
import { Icon } from '../../../../../atoms/Icons'
import { Text } from '../../../../../atoms/Text'

export type Attr = { path: string; attributes?: Record<string, string> }
type Props = TypedNodeViewProps<Attr>

function View({ node, updateAttributes: _ua }: Props) {
  // TODO: Implement the logic to handle changes in attributes
  // const _onChangeAttribute = useCallback(
  //   ({ name, value }: { name: string; value: string }) => {
  //     updateAttributes({
  //       attributes: { ...node.attrs.attributes, [name]: value },
  //     })
  //   },
  //   [updateAttributes, node.attrs.attributes],
  // )

  return (
    <BaseNodeView
      as='span'
      errors={node.attrs.errors}
      className='align-middle inline-flex flex-row items-center gap-1 rounded p-1 cursor-pointer bg-muted/50 hover:bg-muted'
    >
      <Icon name='file' />
      <Text.H5>{node.attrs.path}</Text.H5>
    </BaseNodeView>
  )
}

export default withNodeViewProps(View)
