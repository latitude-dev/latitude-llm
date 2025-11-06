import { LatitudeTool } from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'

export const ICON_BY_LATITUDE_TOOL: Record<LatitudeTool, IconName> = {
  [LatitudeTool.RunCode]: 'code',
  [LatitudeTool.WebSearch]: 'search',
  [LatitudeTool.WebExtract]: 'globe',
  [LatitudeTool.Think]: 'brain',
  [LatitudeTool.TODO]: 'listTodo',
}
