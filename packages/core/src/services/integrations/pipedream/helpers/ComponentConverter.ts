import { McpTool } from '@latitude-data/constants'
import {
  PipedreamComponent,
  PipedreamComponentType,
} from '../../../../constants'
import propsToJSONSchema from './PropsToJSONConverter'

export function pipedreamComponentToToolDefinition(
  component: PipedreamComponent<PipedreamComponentType.Tool>,
): McpTool {
  return {
    name: component.key,
    displayName: component.name,
    description: component.description,
    inputSchema: propsToJSONSchema(component.configurableProps),
  }
}
