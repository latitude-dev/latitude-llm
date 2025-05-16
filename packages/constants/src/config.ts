export enum ParameterType {
  Text = 'text',
  Image = 'image',
  File = 'file',
}

export const LATITUDE_TOOL_PREFIX = 'lat_tool'
export const AGENT_TOOL_PREFIX = 'lat_agent'
export const AGENT_RETURN_TOOL_NAME = 'end_autonomous_chain'
export const FAKE_AGENT_START_TOOL_NAME = 'start_autonomous_chain'

export enum LatitudeTool {
  RunCode = 'code',
  WebSearch = 'search',
  WebExtract = 'extract',
}

export enum LatitudeToolInternalName {
  RunCode = 'lat_tool_run_code',
  WebSearch = 'lat_tool_web_search',
  WebExtract = 'lat_tool_web_extract',
}

export const MAX_STEPS_CONFIG_NAME = 'maxSteps'
export const DEFAULT_MAX_STEPS = 20
export const ABSOLUTE_MAX_STEPS = 150
