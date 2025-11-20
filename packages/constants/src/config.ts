export enum ParameterType {
  Text = 'text',
  Image = 'image',
  File = 'file',
}

export const AGENT_TOOL_PREFIX = 'lat_agent'
export const LATITUDE_TOOL_PREFIX = 'lat_tool'

export enum LatitudeTool {
  RunCode = 'code',
  WebSearch = 'search',
  WebExtract = 'extract',
  Think = 'think',
  TODO = 'todo',
}

export enum LatitudeToolInternalName {
  RunCode = 'lat_tool_run_code',
  WebSearch = 'lat_tool_web_search',
  WebExtract = 'lat_tool_web_extract',
  Think = 'think',
  TODO = 'todo_write',
}

export const NOT_SIMULATABLE_LATITUDE_TOOLS = [
  LatitudeTool.Think,
  LatitudeTool.TODO,
] as LatitudeTool[]

export const MAX_STEPS_CONFIG_NAME = 'maxSteps'
export const DEFAULT_MAX_STEPS = 20
export const ABSOLUTE_MAX_STEPS = 150

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1)

export type DiffValue = {
  newValue?: string
  oldValue?: string
}

export const humanizeTool = (tool: string, suffix: boolean = true) => {
  if (tool.startsWith(AGENT_TOOL_PREFIX)) {
    const name = tool.replace(AGENT_TOOL_PREFIX, '').trim().split('_').join(' ')
    return suffix ? `${name} agent` : name
  }

  if (tool.startsWith(LATITUDE_TOOL_PREFIX)) {
    const name = tool
      .replace(LATITUDE_TOOL_PREFIX, '')
      .trim()
      .split('_')
      .join(' ')
    return suffix ? `${name} tool` : name
  }

  const name = tool.trim().split('_').map(capitalize).join(' ')
  return suffix ? `${name} tool` : name
}
