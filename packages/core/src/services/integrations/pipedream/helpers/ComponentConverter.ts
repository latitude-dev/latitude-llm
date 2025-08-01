import { McpTool } from '@latitude-data/constants'
import {
  PipedreamComponent,
  PipedreamComponentType,
} from '../../../../constants'
import propsToJSONSchema from './propsToJSONConverter'

export function pipedreamComponentToToolDefinition(
  component: PipedreamComponent<PipedreamComponentType.Tool>,
): McpTool {
  return {
    name: component.key,
    description: component.description,
    inputSchema: propsToJSONSchema(component.configurable_props),
  }
}
