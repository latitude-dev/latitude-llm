import type { McpTool } from '@latitude-data/constants'
import type { PipedreamComponent, PipedreamComponentType } from '../../../../constants'
import propsToJSONSchema from './PropsToJSONConverter'

export function pipedreamComponentToToolDefinition(
  component: PipedreamComponent<PipedreamComponentType.Tool>,
): McpTool {
  return {
    name: component.key,
    description: component.description,
    inputSchema: propsToJSONSchema(component.configurable_props),
  }
}
