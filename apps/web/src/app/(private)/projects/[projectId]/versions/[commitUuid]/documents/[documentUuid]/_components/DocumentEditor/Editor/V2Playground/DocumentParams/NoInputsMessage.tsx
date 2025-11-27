import { Text } from '@latitude-data/web-ui/atoms/Text'

/**
 * Shared component for displaying "no inputs" message across parameter tabs
 */
export function NoInputsMessage() {
  return (
    <Text.H6 color='foregroundMuted'>
      No inputs. Use &#123;&#123;input_name&#125;&#125; to insert.
    </Text.H6>
  )
}
